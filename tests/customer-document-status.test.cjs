const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','js','ui.js'),'utf8');

function fn(name){
  const start=source.indexOf(`function ${name}(`);
  assert.ok(start>=0,name);
  return source.slice(start,source.indexOf('\n}',start)+2);
}

function ctx(status){
  const c={currentBuildLifecycleStatus:()=>status};
  vm.createContext(c);
  vm.runInContext(`${fn('normalizeJobType')}\n${fn('customerDocumentLabels')}\n${fn('customerQuoteConfirmationText')}\n${fn('customerDocumentConfirmationText')}`,c);
  return c;
}

test('document labels follow build status',()=>{
  const q=ctx('quote').customerDocumentLabels();
  assert.equal(q.title,'Customer Quote');
  assert.equal(q.viewLabel,'View Quote');
  assert.equal(q.numberLabel,'Quote Number');
  const a=ctx('active').customerDocumentLabels();
  assert.equal(a.title,'Build Confirmation');
  assert.equal(a.viewLabel,'View Build Confirmation');
  const c=ctx('complete').customerDocumentLabels();
  assert.equal(c.title,'Build Summary');
  assert.ok(!/invoice|receipt/i.test(JSON.stringify(c)));
});

test('quote wording keeps acceptance text; active/complete drop it',()=>{
  const quote=ctx('quote').customerDocumentConfirmationText(true);
  assert.match(quote,/before confirming/);
  assert.match(quote,/required deposit/);
  const active=ctx('active').customerDocumentConfirmationText(true);
  assert.match(active,/proceeding/);
  assert.ok(!/before confirming|deposit has been received|quote/i.test(active));
  const done=ctx('complete').customerDocumentConfirmationText(false);
  assert.match(done,/complete/);
  assert.ok(!/before confirming|invoice|receipt/i.test(done));
});

test('email draft wording is status-aware and keeps the quote reference',()=>{
  const email=source.slice(source.indexOf('function customerEmailLines('),source.indexOf('function requestDeleteBlank('));
  assert.match(email,/const docLabels=customerDocumentLabels\(\)/);
  assert.match(email,/\$\{docLabels\.jobNoun\} — \$\{reference\}/);
  assert.match(email,/const reference=quoteNumber\|\|docLabels\.emailName/);
  assert.match(email,/docLabels\.subjectName/);
  assert.match(email,/docLabels\.key==='quote' && \(math\.amountReceived<=0/);
  assert.match(email,/Reference: \$\{reference\}/);
});
