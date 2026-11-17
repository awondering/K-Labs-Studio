// Build -> Guide Setup -> Guide Positions & Angles: per-guide Spacing derived from the saved positions (presentation only).
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','js','ui.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function fn(name){const start=source.indexOf(`function ${name}(`);assert.ok(start>=0,name);return source.slice(start,source.indexOf('\n}',start)+2);}
const ctx={};vm.createContext(ctx);vm.runInContext(fn('guideRowSpacingMm'),ctx);
const rows=(cums)=>cums.map((cum,i)=>({g:i+1,cum}));
test('guide 1 spacing is its position from the tip',()=>{assert.equal(ctx.guideRowSpacingMm(rows([140,305,501]),0),140);});
test('later spacing is the position minus the previous position (140/305/501 gives 140/165/196)',()=>{
  const r=rows([140,305,501]);assert.deepEqual([0,1,2].map((i)=>ctx.guideRowSpacingMm(r,i)),[140,165,196]);
});
test('spacing values sum back to the last guide position',()=>{
  const r=rows([105,220.5,350,498.25]);const sum=r.reduce((t,_,i)=>t+ctx.guideRowSpacingMm(r,i),0);assert.ok(Math.abs(sum-498.25)<1e-9);
});
test('missing or unreadable positions give no number (shown as a dash) rather than NaN text',()=>{
  assert.ok(Number.isNaN(ctx.guideRowSpacingMm([{g:1,cum:100},{g:2}],1)));assert.ok(Number.isNaN(ctx.guideRowSpacingMm([],0)));
});
test('the helper reads nothing but the passed rows (no stored field, no storage, no network)',()=>{
  const body=fn('guideRowSpacingMm');assert.doesNotMatch(body,/quote\.|Store\.|localStorage|fetch\(|window\./);
});
test('the renderer shows a Spacing cell between Position and Angle and no new field is saved',()=>{
  const body=fn('renderGuideSpecificationSummary');
  assert.match(body,/guide-specification__spacing/);assert.match(body,/guideRowSpacingMm\(rows,index\)/);
  assert.ok(body.indexOf('guide-specification__spacing')<body.indexOf('${angleText}'));
  assert.doesNotMatch(body,/quote\.[A-Za-z.]*\s*=[^=]|Store\.set|saveQuoteCurrent/);
});
test('the column header carries the active unit and the markup is present',()=>{
  assert.match(html,/data-guide-spec-position-column/);assert.match(html,/data-guide-spec-spacing-column/);
  assert.match(fn('renderGuideSpecificationSummary'),/Spacing \(\$\{unit\}\)/);
});
test('Workshop spacing code is unchanged (still uses row.spacing)',()=>{assert.match(source,/formatGuideListMeasurement\(row\.spacing\)/);});
