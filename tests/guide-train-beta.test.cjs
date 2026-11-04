const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'css','studio.css'),'utf8');
const worker=fs.readFileSync(path.join(root,'service-worker.js'),'utf8');

const launcher=html.slice(html.indexOf('data-workshop-tool-open="guide-train"'),html.indexOf('</button>',html.indexOf('data-workshop-tool-open="guide-train"')));
const cardStart=html.indexOf('<article id="workshopToolGuideTrain"');
const card=html.slice(cardStart,html.indexOf('</article>',cardStart));
const head=card.slice(0,card.indexOf('guide-train-inputs'));
const plain=(markup)=>markup.replace(/<[^>]+>/g,'').replace(/&mdash;/g,'-').replace(/\s+/g,' ').trim();

test('Beta: the Workshop launcher and the tool heading are labelled',()=>{
  assert.match(launcher,/Guide Train Designer <span class="guide-train-beta">Beta<\/span>/);
  assert.match(card,/<h3>Guide Train Designer <span class="guide-train-beta">Beta<\/span><\/h3>/);
  assert.equal((html.match(/guide-train-beta">/g)||[]).length,2,'exactly the launcher and the heading');
});

test('the provisional-positions warning is shown with the exact wording, in the tool heading',()=>{
  const note=head.match(/<p class="guide-train-beta-note" role="note">([\s\S]*?)<\/p>/);
  assert.ok(note,'warning note');
  assert.equal(plain(note[1]),'Guide positions are provisional. Validate against actual guide dimensions, rod deflection and static-load testing before building.');
  assert.equal((html.match(/guide-train-beta-note/g)||[]).length,1);
  assert.ok(head.indexOf('guide-train-beta-note')>head.indexOf('<h3>'),'warning sits under the heading, above the inputs');
});

test('nothing claims the layouts are validated',()=>{
  const text=plain(card)+plain(launcher);
  assert.doesNotMatch(text,/\b(proven|guaranteed|optimal|certified|physically validated)\b/i);
});

test('Beta styling reuses the established badge look and stays small and scoped',()=>{
  const rule=css.match(/\.guide-train-beta\{([^}]*)\}/)[1];
  assert.match(rule,/font-size:9px/);
  assert.match(rule,/border:1px solid rgba\(var\(--kl-red-rgb\),\.6\)/);
  assert.match(rule,/border-radius:999px/);
  assert.match(rule,/text-transform:uppercase/);
  const thread=css.match(/\.thread-wrap-beta\{([^}]*)\}/)[1];
  assert.equal(rule.replace(/\s+/g,''),thread.replace(/\s+/g,''),'identical to the existing Thread Wrap badge');
  const note=css.match(/#workshopToolGuideTrain \.guide-train-beta-note\{([^}]*)\}/)[1];
  assert.match(note,/font-size:11px/);
  assert.match(note,/rgba\(var\(--kl-red-rgb\),\.4\)/);
  assert.equal(/#workshopToolThreadWrap \.guide-train|\.thread-wrap-beta[^{]*guide/.test(css),false);
});

test('publication is limited to the Guide Train Designer: Guide Spacing, other tools and the Thread Wrap Beta are untouched',()=>{
  assert.equal((html.match(/data-workshop-tool-open="guide-train"/g)||[]).length,1,'one launcher, standalone');
  assert.equal((html.match(/id="workshopToolGuideTrain"/g)||[]).length,1);
  for(const tool of ['diameter','grip','thread-wrap'])assert.ok(html.includes(`data-workshop-tool-open="${tool}"`),tool);
  assert.match(html,/Thread Wrap Designer <span class="thread-wrap-beta">Beta<\/span>/);
  assert.doesNotMatch(card,/guide-spacing|Guide Spacing|guideSpecification|guideLayout/i);
  assert.match(worker,/'js\/guide-train\.js'/);
});

test('service worker cache is bumped exactly once from the production baseline (build148-v186 -> v187)',()=>{
  assert.match(worker,/const APP_SHELL_VERSION='build148-v187';/);
  assert.equal((worker.match(/build148-v\d+/g)||[]).length,1);
});
