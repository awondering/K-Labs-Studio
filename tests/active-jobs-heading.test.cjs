// Q3: the shared list holds builds, repairs and Components orders, so its heading says "Active Jobs". Quotes is unchanged.
const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const ui=fs.readFileSync(path.join(root,'js','ui.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');

test('the list heading reads "Active Jobs" on first load and when the tab switches back; Quotes is unchanged',()=>{
  assert.match(html,/<h1 id="buildsScreenTitle">Active Jobs<\/h1>/);
  assert.ok(ui.includes("titleEl.textContent=isQuoteTab?'Quotes':'Active Jobs';"));
  assert.doesNotMatch(html,/>Active Builds</);
  assert.ok(!ui.includes("'Active Builds'"));
});

test('Q9: subtitle, empty list and Home tile say "jobs"; the Quotes wording is unchanged',()=>{
  assert.ok(html.includes('<p id="buildsScreenSubtitle" class="subtle">Continue working on jobs in progress.</p>'));
  assert.ok(ui.includes(":'Continue working on jobs in progress.';"));
  assert.ok(ui.includes('<h3>No active jobs yet.</h3>'));
  assert.ok(html.includes('<span class="workshop-tool-launch__meta">Manage active jobs and customer quotes.</span>'));
  assert.ok(ui.includes("isQuoteTab?'Quotes waiting to be confirmed as active builds.'"),'Quotes subtitle unchanged');
  assert.ok(ui.includes('<h3>No quotes yet.</h3>'),'Quotes empty state unchanged');
  for(const old of ['rods currently in progress','No active builds yet','Manage active builds'])assert.ok(!ui.includes(old)&&!html.includes(old),old);
});
