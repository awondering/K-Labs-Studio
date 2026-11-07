const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const enginePath=path.join(root,'js','thread-wrap.js');
const engineBytes=fs.readFileSync(enginePath);
const Engine=require('../js/thread-wrap.js');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'css','studio.css'),'utf8');
const uiSource=fs.readFileSync(path.join(root,'js','ui.js'),'utf8');

// UTF-8 text that a wrongly chosen legacy charset (windows-1252/Latin-1) turns into "A", "Euro" style junk:
// a lead byte (U+00C2..U+00F4) followed by a Latin-1/windows-1252 rendering of a UTF-8 continuation byte.
const MOJIBAKE=/[\u00C2-\u00F4][\u0080-\u00BF\u0152\u0153\u0160\u0161\u0178\u017D\u017E\u0192\u02C6\u02DC\u2013\u2014\u2018\u2019\u201A\u201C\u201D\u201E\u2020\u2021\u2022\u2026\u2030\u2039\u203A\u20AC\u2122]/;
const nonAscii=(text)=>[...String(text)].filter((ch)=>ch.codePointAt(0)>127);
const isAscii=(text)=>nonAscii(text).length===0;

// The only non-ASCII characters Thread Wrap output may contain, each deliberate.
const EXPECTED_GLYPHS=new Map([
  [0x00B0,'degree sign'],[0x00B7,'middle dot'],[0x00D7,'multiplication sign'],[0x03C0,'pi'],[0x2013,'en dash'],
  [0x2014,'em dash'],[0x2019,'right single quotation mark'],[0x201C,'left double quotation mark'],
  [0x201D,'right double quotation mark'],[0x2026,'ellipsis'],[0x2192,'rightwards arrow'],[0x2248,'almost equal to'],
  [0x00E9,'e acute'],[0x00F4,'o circumflex'],
]);

function allEngineStrings(){
  const out=[];
  const walk=(value)=>{
    if(typeof value==='string')out.push(value);
    else if(Array.isArray(value))value.forEach(walk);
    else if(value && typeof value==='object')Object.values(value).forEach(walk);
  };
  const base={lengthMm:250,buttDiameterMm:16.9,tipDiameterMm:15.3,axes:2,accentThreads:1,mainColour:'black',accentColour:'gold'};
  for(const axes of Engine.AXIS_OPTIONS){
    const d=Engine.designDiamondWrap({...base,axes,repeats:axes===2?5:axes*2+1});
    if(d.ok){
      walk(Engine.buildInstructions(d));
      out.push(Engine.buildPreviewSvg(d,{width:340}));
      walk(d.warnings);
    }
  }
  for(const bad of [{},{lengthMm:'x'},{lengthMm:5},{tipDiameterMm:2},{repeats:30},{repeats:1},{repeats:2.5},{axes:3}]){
    const d=Engine.designDiamondWrap({...base,...bad});
    walk(d.errors);walk(d.warnings);
  }
  const imperial={length:(mm)=>`${(mm/25.4).toFixed(3)} in`,degrees:(deg)=>`${deg.toFixed(1)}\u00B0`};
  walk(Engine.designDiamondWrap({...base,repeats:8},imperial).warnings);
  walk([Engine.SOURCES,Engine.DOCUMENTED,Engine.ASSUMPTIONS,Engine.THREAD_COLOURS]);
  return out;
}

test('engine source is pure ASCII, so no charset can corrupt it',()=>{
  const bad=[...engineBytes].findIndex((byte)=>byte>127);
  assert.equal(bad,-1,`non-ASCII byte at offset ${bad}`);
  assert.ok(!engineBytes.includes(0xEF) || engineBytes.slice(0,3).toString('hex')!=='efbbbf','no BOM');
  assert.equal(engineBytes.toString('latin1'),engineBytes.toString('utf8'));
});

test('engine behaves identically when its file is decoded as UTF-8 or as Latin-1/windows-1252',()=>{
  const load=(encoding)=>{
    const sandbox={module:{exports:{}}};
    vm.runInNewContext(engineBytes.toString(encoding),sandbox);
    return sandbox.module.exports;
  };
  const utf8=load('utf8');
  const latin1=load('latin1');
  const input={lengthMm:250,buttDiameterMm:16.9,tipDiameterMm:15.3,axes:4,accentThreads:2,mainColour:'red',accentColour:'silver'};
  // Objects from separate VM realms have different prototypes, so compare their JSON forms.
  const json=(value)=>JSON.stringify(value);
  const a=utf8.designDiamondWrap(input);
  const b=latin1.designDiamondWrap(input);
  assert.equal(json(b),json(a));
  assert.equal(latin1.buildPreviewSvg(b,{width:340}),utf8.buildPreviewSvg(a,{width:340}));
  assert.equal(json(latin1.buildInstructions(b)),json(utf8.buildInstructions(a)));
  assert.equal(json(latin1.DOCUMENTED),json(utf8.DOCUMENTED));
  assert.equal(json(latin1.SOURCES),json(utf8.SOURCES));
  assert.equal(json(latin1.designDiamondWrap({...input,repeats:30}).errors),json(utf8.designDiamondWrap({...input,repeats:30}).errors));
});

test('the SVG preview markup is pure ASCII and writes degrees as a numeric character reference',()=>{
  for(const axes of Engine.AXIS_OPTIONS){
    for(const width of [260,340,390,760]){
      const design=Engine.designDiamondWrap({lengthMm:250,buttDiameterMm:16.9,tipDiameterMm:15.3,axes,repeats:axes===2?5:axes*2+1});
      assert.equal(design.ok,true);
      const svg=Engine.buildPreviewSvg(design,{width});
      assert.equal(nonAscii(svg).join(''),'',`axes ${axes} width ${width}`);
      assert.doesNotMatch(svg,MOJIBAKE);
      const labels=[...svg.matchAll(/<text class="tw-axislabel"[^>]*>([^<]*)<\/text>/g)].map((m)=>m[1]);
      assert.equal(labels.length,axes);
      labels.forEach((label,k)=>assert.equal(label,`A${k+1} ${360*k/axes}&#176;`));
    }
  }
});

test('the SVG decodes to the right glyphs when parsed (degree sign, not Latin-1 junk)',()=>{
  const design=Engine.designDiamondWrap({lengthMm:250,buttDiameterMm:16.9,tipDiameterMm:15.3,axes:2,repeats:5});
  const svg=Engine.buildPreviewSvg(design,{width:340});
  const decoded=svg.replace(/&#(\d+);/g,(_,code)=>String.fromCodePoint(Number(code)));
  assert.match(decoded,/>A1 0\u00B0<\/text>/);
  assert.match(decoded,/>A2 180\u00B0<\/text>/);
  assert.ok(!decoded.includes('\u00C2\u00B0'),'no double-encoded degree sign');
  // the same bytes, delivered as UTF-8 or as Latin-1, parse to the same text because they are ASCII
  assert.equal(Buffer.from(svg,'utf8').toString('latin1'),svg);
});

test('engine output uses the intended special characters as real code points',()=>{
  const d=Engine.designDiamondWrap({lengthMm:250,buttDiameterMm:16.9,tipDiameterMm:15.3,axes:2,repeats:5});
  const steps=Engine.buildInstructions(d).map((s)=>s.lines.join('\n')).join('\n');
  assert.ok(steps.includes('180\u00B0 from Axis 1'),'degree sign');
  assert.ok(steps.includes('divide that circumference by \u03C0 (3.1416)'),'pi');
  assert.ok(steps.includes('\u201CFrom butt end\u201D column') && steps.includes('\u201CGap\u201D column'),'curly double quotes');
  assert.ok(steps.includes('A1 r0 \u2192 A2 r1 \u2192 A1 r2 \u2192 \u2026 \u2192 A1 r10'),'arrows and ellipsis');
  assert.ok(steps.includes('(0, 2, 4\u2026)'),'ellipsis in row lists');
  assert.ok(steps.includes('manufacturer\u2019s'),'right single quotation mark');
  assert.equal(Engine.DEFAULT_FMT.degrees(45),'45\u00B0');
  assert.ok(Engine.DOCUMENTED.find((x)=>x.id==='equal-area').text.includes('circumference \u00D7 repeat length'),'multiplication sign');
  assert.ok(Engine.ASSUMPTIONS.find((x)=>x.id==='round-blank').text.includes('\u03C0 \u00D7 diameter'));
  assert.ok(Engine.SOURCES.find((x)=>x.id==='rodhouse').title.includes('J\u00E9r\u00F4me'));
  const angleMessage=Engine.designDiamondWrap({lengthMm:250,buttDiameterMm:16.9,tipDiameterMm:15.3,axes:2,repeats:30}).errors[0].message;
  assert.match(angleMessage,/\d\u00B0 from the rod/);
});

test('no engine string contains mojibake or replacement characters, and every non-ASCII glyph is deliberate',()=>{
  const strings=allEngineStrings();
  assert.ok(strings.length>150);
  const seen=new Set();
  for(const text of strings){
    assert.doesNotMatch(text,MOJIBAKE,text.slice(0,80));
    assert.ok(!text.includes('\uFFFD'),`replacement character in: ${text.slice(0,80)}`);
    nonAscii(text).forEach((ch)=>{
      seen.add(ch.codePointAt(0));
      assert.ok(EXPECTED_GLYPHS.has(ch.codePointAt(0)),`unexpected U+${ch.codePointAt(0).toString(16).toUpperCase()} in: ${text.slice(0,80)}`);
    });
    // text that is valid UTF-8 round-trips unchanged
    assert.equal(Buffer.from(text,'utf8').toString('utf8'),text);
  }
  [0x00B0,0x03C0,0x201C,0x2192,0x2026,0x2019].forEach((code)=>assert.ok(seen.has(code),`U+${code.toString(16)} is exercised`));
});

function between(text,start,end){
  const from=text.indexOf(start);
  assert.ok(from>=0,start);
  const to=end?text.indexOf(end,from):text.length;
  assert.ok(to>from,end||'end');
  return text.slice(from,to);
}
function functionSource(name){
  const start=uiSource.indexOf(`function ${name}(`);
  assert.ok(start>=0,name);
  const lineEnd=uiSource.indexOf('\n',start);
  const end=uiSource.slice(start,lineEnd).trimEnd().endsWith('}')?lineEnd:uiSource.indexOf('\n}',start)+2;
  return uiSource.slice(start,end);
}

test('Thread Wrap markup, styles and UI code contain no raw non-ASCII characters (entities and escapes only)',()=>{
  const card=between(html,'<article id="workshopToolThreadWrap"','</article>');
  assert.equal(nonAscii(card).join(''),'');
  const launcher=between(html,'data-workshop-tool-open="thread-wrap"','</button>');
  assert.equal(nonAscii(launcher).join(''),'');
  assert.equal(nonAscii(between(html,'<script src="js/thread-wrap.js">','</script>')).join(''),'');
  assert.equal(nonAscii(between(css,'/* Thread Wrap Designer (Workshop)')).join(''),'');
  for(const name of ['threadWrapEngine','threadWrapFormatter','readThreadWrapMeasurement','threadWrapRequest','threadWrapEffectiveRepeats','ensureThreadWrapSwatches','renderThreadWrapMethod','renderThreadWrapTool','bindThreadWrapControls']){
    assert.equal(nonAscii(functionSource(name)).join(''),'',name);
  }
});

test('the page declares UTF-8 first, within the first 1024 bytes, so HTML entities and other scripts decode correctly',()=>{
  const head=Buffer.from(html,'utf8').slice(0,1024).toString('utf8');
  const meta=head.search(/<meta charset="utf-8"\s*\/?>/i);
  assert.ok(meta>=0,'meta charset within 1024 bytes');
  assert.ok(meta<head.search(/<title/i),'declared before the title');
  assert.equal((html.match(/<meta[^>]+charset/gi)||[]).length,1,'a single charset declaration');
  assert.ok(!/charset=(?!utf-8)[a-z0-9-]+/i.test(html),'no competing charset');
  assert.doesNotMatch(html,MOJIBAKE,'index.html contains no mojibake');
  assert.ok(!html.includes('\uFFFD'));
});

test('Thread Wrap entity references used by the HTML decode to the intended characters',()=>{
  const card=between(html,'<article id="workshopToolThreadWrap"','</article>');
  const entities={'&mdash;':'\u2014','&minus;':'\u2212','&#x2039;':'\u2039','&rsquo;':'\u2019'};
  for(const [entity,glyph] of Object.entries(entities)){
    if(card.includes(entity))assert.equal(glyph.codePointAt(0)>127,true,entity);
  }
  assert.ok(card.includes('<h3>Thread Wrap Designer</h3>'));
  assert.ok(card.includes('Calculated positions are starting marks for laying out a basic diamond cross-wrap.'));
  assert.doesNotMatch(card,/thread-wrap-beta|>Beta</);
  assert.ok(card.includes('&minus;'));
});
