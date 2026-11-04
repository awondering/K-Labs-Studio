const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const css=fs.readFileSync(path.join(root,'css','studio.css'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');

test('Build Editor widens only while the active Workshop editor is visible on desktop',()=>{
  const media=css.match(/@media \(min-width:761px\)\{([\s\S]*?)\n\}/);
  assert.ok(media,'desktop breakpoint exists');
  assert.match(media[1],/\.app-shell:has\(#workshopScreen\.active #studioWorkflowPanel:not\(\[hidden\]\)\)\{\s*width:min\(100%,840px\);/);
  assert.doesNotMatch(media[1],/\.app-shell\s*\{/);
  assert.match(html,/<section class="screen" id="workshopScreen">[\s\S]*?<section id="studioWorkflowPanel" class="quote-builder"[^>]*hidden>/);
});

test('Build Editor desktop sizing leaves existing mobile sizing rules unchanged',()=>{
  assert.match(css,/@media \(max-width:760px\)/);
  assert.doesNotMatch(css,/@media \(max-width:760px\)\{[^}]*#studioWorkflowPanel/);
});
