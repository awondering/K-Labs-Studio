const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const ui=fs.readFileSync(path.join(__dirname,'..','js','ui.js'),'utf8');
const sectionHtml=html.slice(html.indexOf('<article id="workshopPricingSection"'),html.indexOf('</article>',html.indexOf('<article id="workshopPricingSection"')));
test('pricing and actions live in one collapsible section',()=>{
  assert.ok(!html.includes('id="workshopActionsSection"'));
  assert.ok(!html.includes('workshopBuildActionsBody'));
  assert.equal((sectionHtml.match(/data-collapsible-trigger/g)||[]).length,1);
  for(const id of ['quoteLabourRate','quoteRecordPaymentBtn','viewInvoicePreviewBtn','workshopBuildLifecycleStatus','toggleCurrentBuildStatusBtn','viewQuoteBtn','emailQuoteBtn','workshopBuildActionsStatus','currentBuildActionsMenuBtn','confirmBuildBtn']){
    assert.ok(sectionHtml.includes(`id="${id}"`),id);
  }
});
test('pricing fields come before the actions block inside the single body',()=>{
  assert.ok(sectionHtml.indexOf('id="workshopPricingFields"')<sectionHtml.indexOf('workshop-build-actions-surface'));
  assert.ok(sectionHtml.indexOf('id="workshopQuoteSummaryBody"')<sectionHtml.indexOf('id="workshopPricingFields"'));
});
test('section registry no longer references the removed body',()=>{
  assert.match(ui,/WORKSHOP_COLLAPSIBLE_SECTION_IDS=\['workshopCustomerBody','workshopBuildSpecsBody','workshopComponentsBody','workshopQuoteSummaryBody'\]/);
  assert.ok(!ui.includes('workshopBuildActionsBody'));
  assert.ok(!ui.includes('workshopActionsSection'));
});
