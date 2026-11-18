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
