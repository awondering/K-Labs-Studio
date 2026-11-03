const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'css','studio.css'),'utf8');

test('Grip Wrap paired fields use concise labels and retain their meaning',()=>{
  assert.match(html,/data-measurement-label="Grip Length">Grip Length</);
  assert.match(html,/data-measurement-label="Cover width \/ Cord diameter">Cover width \/ Cord diameter</);
  assert.match(html,/id="workshopGripLength"[^>]*type="text"[^>]*inputmode="decimal"/);
  assert.match(html,/id="workshopGripCoverWidth"[^>]*type="text"[^>]*inputmode="decimal"/);
});

test('Grip Wrap paired labels align and remain two columns on narrow screens',()=>{
  assert.match(css,/#workshopToolGrip \.workshop-tool-fields--two label > span\{\s*min-height:24px;\s*line-height:1\.2;/);
  assert.match(css,/@media \(max-width:640px\)\{[\s\S]*?#workshopToolGrip \.workshop-tool-fields--two\{\s*grid-template-columns:repeat\(2,minmax\(0,1fr\)\);/);
  assert.match(css,/#workshopToolDiameter \.workshop-tool-fields input,\s*#workshopToolGrip \.workshop-tool-fields input\{[\s\S]*?min-height:42px;/);
});
