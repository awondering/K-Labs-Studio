// Components -> Component Details: Stock Quantity input must show its number clearly (no spinner over the value).
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const css=fs.readFileSync(path.join(__dirname,'..','css','studio.css'),'utf8');
const source=fs.readFileSync(path.join(__dirname,'..','js','ui.js'),'utf8');

test('the stock input hides the native spinner so arrows cannot cover the number',()=>{
  assert.match(css,/#studioComponentDetails #studioComponentStockOnHand\{[^}]*appearance:textfield;[^}]*\}/);
  assert.match(css,/#studioComponentDetails #studioComponentStockOnHand::-webkit-outer-spin-button,\s*#studioComponentDetails #studioComponentStockOnHand::-webkit-inner-spin-button\{\s*-webkit-appearance:none;\s*margin:0;\s*\}/);
});

test('the stock input keeps a readable minimum width beside its inline label on wider screens only',()=>{
  assert.match(css,/#studioComponentDetails #studioComponentStockOnHand\{[^}]*min-width:64px;/);
  assert.match(css,/@media \(min-width:640px\)\{\s*#studioComponentDetails \.studio-component-details__fields \.quote-component-field--cost:has\(#studioComponentStockOnHand\)\{\s*grid-template-columns:auto minmax\(64px,1fr\);\s*\}\s*\}/);
  // Phone layout still stacks the label above the input.
  assert.match(css,/@media \(max-width:639px\)\{\s*#studioComponentDetails \.studio-component-details__fields \.quote-component-field--cost\{\s*grid-template-columns:1fr;/);
});

test('the fix is presentation only: Buy/Sell keep their spinners and the stock markup and save path are unchanged',()=>{
  assert.doesNotMatch(css,/#studioComponentCost[^{]*\{[^}]*appearance:textfield/);
  assert.doesNotMatch(css,/#studioComponentUnitPrice[^{]*\{[^}]*appearance:textfield/);
  assert.match(source,/<input id="studioComponentStockOnHand" type="number" inputmode="decimal" step="0\.01" min="0" /);
  assert.match(source,/const stockInput=\$\('studioComponentStockOnHand'\);/);
});
