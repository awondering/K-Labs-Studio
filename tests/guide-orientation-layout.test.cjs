const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'css','studio.css'),'utf8');

test('Guide Orientation retains its existing explanatory note and mode controls',()=>{
  const start=html.indexOf('<section id="workshopToolSpiral"');
  const end=html.indexOf('</section>',start);
  const orientation=html.slice(start,end);
  assert.ok(start>=0);
  for(const mode of ['standard','acute','progressive','offset']){
    assert.match(orientation,new RegExp(`data-spiral-method="${mode}"`));
  }
  assert.match(orientation,/id="workshopSpiralMethodNote"/);
  assert.match(orientation,/aria-label="Orientation mode"/);
});

test('Guide Orientation heading and control groups use compact scoped spacing',()=>{
  assert.match(css,/#layoutScreen \.guide-setup-heading--next\{\s*margin-top:6px;\s*padding-top:8px;/);
  assert.match(css,/#layoutScreen \.guide-setup-orientation\{\s*display:grid;\s*gap:6px;\s*padding:8px;/);
  assert.match(css,/\.spiral-method-note\{\s*margin:0;\s*min-height:0;/);
});

test('Rod Style and orientation mode controls retain 44px touch targets',()=>{
  assert.match(css,/#workshopToolSpiral \.workshop-tool-unit-row\[data-spiral-method-row="true"\] \.ghost-action,\s*#workshopToolSpiral \.workshop-tool-unit-row\[data-spiral-direction-row="true"\] \.ghost-action\{\s*min-height:44px;/);
  assert.match(css,/#workshopToolSpiral \.spiral-rod-style__options \.ghost-action\{\s*min-height:44px;/);
});

test('orientation selected-state and mapper reveal behavior remain wired',()=>{
  assert.match(css,/\.workshop-tool-unit-row \.ghost-action\.active\{\s*border-color:rgba\(var\(--kl-red-rgb\),\.75\);/);
  assert.match(html,/data-spiral-method="progressive" aria-pressed="true"/);
  assert.match(fs.readFileSync(path.join(root,'js','ui.js'),'utf8'),/function scheduleSpiralMapperReveal\(\)/);
});
