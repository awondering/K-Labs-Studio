// Q18 Phase 2A: the demonstration player and the scripted journey (steps 1-5).
// Runs js/demo-director.js against a small stand-in page with a virtual clock; the real screens, the live figures
// against quoteMaths() and the watermark are checked in tests/demo-playback-browser.cjs (WebKit).
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const directorSource = read('js/demo-director.js');
const html = read('index.html');
const ui = read('js/ui.js');

// A stand-in page: every control the journey asks for exists and is visible; clicks, typed characters and the order of
// everything the director does are recorded. Time is virtual: a wait of N ms advances the clock by N at once.
function stage({ search = '?demo' } = {}) {
  const log = [];
  const elements = new Map();
  let clock = 0;
  const make = (key) => {
    const el = {
      key, hidden: false, disabled: false, value: '', textContent: '', isConnected: true, listeners: {}, attributes: {},
      style: {}, scrollTop: 0, scrollHeight: 2000, clientHeight: 600,
      dataset: {},
      addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
      dispatchEvent(event) {
        if (event.type === 'input') log.push(['input', key, this.value, event.data ?? null]);
        if (event.type === 'change') log.push(['change', key, this.value]);
        (this.listeners[event.type] || []).forEach((fn) => fn(event));
        return true;
      },
      click() { log.push(['click', key]); (this.listeners.click || []).forEach((fn) => fn({ type: 'click', target: this, isTrusted: false })); },
      closest() { return null; },
      getClientRects() { return this.hidden ? [] : [{}]; },
      getBoundingClientRect() { return { top: 0, height: 80 }; },
      scrollIntoView() {}, scrollTo(opts) { this.scrollTop = opts && typeof opts.top === 'number' ? opts.top : this.scrollTop; },
      focus() {}, setAttribute(name, value) { this.attributes[name] = String(value); }, getAttribute(name) { return this.attributes[name] ?? null; },
      removeAttribute(name) { delete this.attributes[name]; },
      toggleAttribute(name, on) { if (on) this.attributes[name] = ''; else delete this.attributes[name]; },
      querySelectorAll() { return []; },
      classList: { add() {}, remove() {}, toggle() {} },
    };
    elements.set(key, el);
    return el;
  };
  const get = (key) => elements.get(key) || make(key);
  // The journey's "wait until" checks: after the customer is created the new build shows Jordan Ellis and a quote
  // number; the expanded/collapsed state of sections follows what the director tapped.
  get('#quoteCustomerName').value = 'Jordan Ellis';
  // Every caption the visitor is shown is recorded.
  const captionEl = get('#demoCaption');
  let captionText = '';
  Object.defineProperty(captionEl, 'textContent', { get: () => captionText, set: (v) => { captionText = String(v); log.push(['caption', captionText]); } });
  // As in index.html and ui.js: the introduction, the player and Studio's sheets start hidden.
  for (const key of ['#demoIntro', '#demoPlayer', '#choicePickerSheet', '#customerFinderSheet']) get(key).hidden = true;
  const chapterButtons = [1, 2, 3, 4, 5].map((n) => { const b = get(`chapter-${n}`); b.attributes['data-demo-chapter'] = String(n); return b; });
  const document = {
    getElementById: (id) => get(`#${id}`),
    querySelector: (selector) => get(selector),
    querySelectorAll: (selector) => (selector === '[data-demo-chapter]' ? chapterButtons : []),
    documentElement: { style: { setProperty(name, value) { log.push(['style', name, value]); } }, classList: { add() {}, remove() {}, toggle() {} } },
    body: { classList: { contains: () => false } },
  };
  const replaced = [];
  const window = {
    document,
    location: { search, pathname: '/', replace(u) { replaced.push(u); } },
    history: { replaceState() {} },
    setTimeout: (fn, ms) => { clock += Math.max(0, Number(ms) || 0); setImmediate(fn); return 1; },
    clearTimeout() {},
    KLABS_DEMO: { exit() { log.push(['exit']); }, enterUrl: () => '/?demo' },
    ResizeObserver: class { observe() {} },
    console: { warn: (...a) => log.push(['warn', a.map(String).join(' ')]), error() {} },
  };
  window.window = window;
  const context = vm.createContext({ window, document, Event: class { constructor(type, o) { this.type = type; Object.assign(this, o); } },
    InputEvent: class { constructor(type, o) { this.type = type; Object.assign(this, o); } }, Promise, Error, Date, String, Number, Math, Object, Array, JSON, Set, Map, setImmediate, console: window.console });
  vm.runInContext(directorSource, context);
  let inStep = 0;
  const steps = [];
  const director = Object.freeze({ async run(fn) { inStep += 1; steps.push('open'); try { return await fn(); } finally { inStep -= 1; steps.push('close'); } } });
  return { window, document, get, log, replaced, steps, director, chapterButtons, clock: () => clock, inStep: () => inStep };
}
const settle = async (h, untilFn, limit = 200000) => { for (let i = 0; i < limit && !untilFn(); i++) await new Promise((r) => setImmediate(r)); };
const player = (h) => h.window.KLABS_DEMO_PLAYER;
const finished = (h) => /Jordan's quote is ready/.test(h.get('#demoCaption').textContent) || /stopped/i.test(h.get('#demoCaption').textContent);

test('Q18 2A: the journey has five chapters in workflow order, each with short plain-language captions', () => {
  const h = stage();
  const journey = player(h).journey;
  assert.deepEqual(JSON.parse(JSON.stringify(journey.map((c) => c.title))), ['Enquiry', 'Rod spec', 'Components', 'Pricing', 'Quote']);
  for (const chapter of journey) {
    const captions = chapter.steps.filter((s) => s[0] === 'caption').map((s) => s[1]);
    assert.ok(captions.length >= 2, `${chapter.title} has captions`);
    for (const text of captions) {
      assert.ok(text.length <= 120, `short caption: ${text}`);
      assert.doesNotMatch(text, /\b(click|DOM|director|script|selector|field id|input event|quoteMaths|API)\b/i, `workshop language: ${text}`);
    }
  }
  assert.ok(Object.isFrozen(journey) && journey.every((c) => Object.isFrozen(c) && Object.isFrozen(c.steps)), 'the journey cannot be changed at run time');
});

test('Q18 2A: the director works the real Studio controls in workflow order: customer, spec, components, labour, pricing, quote', () => {
  const h = stage();
  const flat = player(h).journey.flatMap((c, i) => c.steps.map((s) => ({ chapter: i + 1, step: s })));
  const at = (pred) => flat.findIndex(({ step }) => pred(step));
  const order = [
    at((s) => s[0] === 'tap' && s[1] === '#homeEnterRodBtn'),
    at((s) => s[0] === 'type' && s[1] === '#customerFinderNewCustomerName' && s[2] === 'Jordan Ellis'),
    at((s) => s[0] === 'tap' && s[1] === '#customerFinderSubmitNewCustomerBtn'),
    at((s) => s[0] === 'type' && s[1] === '#quoteSpecFinishedRodLength'),
    at((s) => s[0] === 'pick' && s[1][0] === 'Blanks'),
    at((s) => s[0] === 'type' && s[1] === '#quoteLabourHours'),
    at((s) => s[0] === 'type' && s[1] === '#quoteMarginPercent'),
    at((s) => s[0] === 'tap' && s[1] === '#viewQuoteBtn'),
  ];
  assert.ok(order.every((i) => i >= 0), JSON.stringify(order));
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'workflow order');
  assert.deepEqual(order.map((i) => flat[i].chapter), [1, 1, 1, 2, 3, 3, 4, 5]);
  // Every control exists on the real page (index.html) or is built by Studio's own interface (ui.js).
  for (const { step } of flat) {
    if (!['tap', 'type', 'open', 'until', 'scroll'].includes(step[0])) continue;
    const selector = step[1];
    const id = /^#([A-Za-z0-9]+)/.exec(selector);
    if (id) assert.ok(html.includes(`id="${id[1]}"`) || ui.includes(`id="${id[1]}"`) || ui.includes(`'${id[1]}'`), `${selector} exists`);
    const attr = /\[([a-z-]+)="([^"]+)"\]/.exec(selector);
    if (attr) assert.ok(html.includes(`${attr[1]}="${attr[2]}"`) || ui.includes(`${attr[1]}="${attr[2]}"`), `${selector} exists`);
  }
  // Components come from the demonstration library by category, subcategory and name - and the parts are ordinary.
  const context = vm.createContext({ window: {} });
  vm.runInContext(read('js/demo-data.js'), context);
  const library = context.window.KLABS_DEMO_DATA.store['klabs-workshop-component-library:'];
  const picks = flat.filter(({ step }) => step[0] === 'pick').map(({ step }) => step[1]);
  assert.ok(picks.length >= 5, 'a realistic set of parts');
  for (const [category, subcategory, name] of picks) {
    assert.ok(library.some((c) => c.category === category && c.subcategory === subcategory && c.name === name), `${name} is in the library`);
  }
});

test('Q18 2A: field values are typed one character at a time, visibly - never filled in at once', async () => {
  const h = stage();
  player(h).open(h.director);
  h.get('#demoStartBtn').click();
  await settle(h, () => finished(h));
  const typed = player(h).journey.flatMap((c) => c.steps).filter((s) => s[0] === 'type');
  for (const [, selector, text] of typed) {
    const inputs = h.log.filter((e) => e[0] === 'input' && e[1] === selector && e[3] !== null).map((e) => e[2]);
    const expected = [...text].map((_, i) => [...text].slice(0, i + 1).join(''));
    assert.deepEqual(inputs.slice(-expected.length), expected, `${selector} typed as ${JSON.stringify(text)}`);
  }
  assert.equal(h.get('#demoCaption').textContent.includes("Jordan's quote is ready"), true, `reaches the quote: ${h.get('#demoCaption').textContent} ${JSON.stringify(h.log.filter((e) => e[0] === 'warn'))}`);
  assert.ok(h.clock() > 60000, `watchable pacing (${h.clock()} ms of playback)`);
  assert.deepEqual(h.steps, ['open', 'close'], 'one director step for the whole playback; the write window closes at the end');
});

test('Q18 2A: the visitor starts the demonstration - nothing plays until Start', async () => {
  const h = stage();
  player(h).open(h.director);
  assert.ok(h.log.some((e) => e[0] === 'style' && e[1] === '--demo-dock-height' && /^\d+px$/.test(e[2])), 'the dock height is measured so sheets sit below it');
  await settle(h, () => false, 2000);
  assert.equal(h.log.filter((e) => e[0] === 'click').length, 0, 'no autoplay');
  assert.equal(h.get('#demoIntro').hidden, false, 'introduction shown');
  assert.equal(h.get('#demoPlayer').hidden, true, 'player controls appear once playing');
});

test('Q18 2A: Pause stops the director mid-chapter (even mid-word) and Play carries on from the same point', async () => {
  const h = stage();
  player(h).open(h.director);
  h.get('#demoStartBtn').click();
  await settle(h, () => h.log.some((e) => e[0] === 'input' && e[1] === '#customerFinderNewCustomerName' && e[2] === 'Jor'));
  h.get('#demoPlayPauseBtn').click();
  const before = h.log.length;
  await settle(h, () => false, 3000);
  assert.equal(h.log.length, before, 'nothing happens while paused');
  assert.match(h.get('#demoPlayPauseBtn').textContent, /Play/);
  assert.match(h.get('#demoCaption').textContent, /Paused/);
  h.get('#demoPlayPauseBtn').click();
  assert.match(h.get('#demoPlayPauseBtn').textContent, /Pause/);
  await settle(h, () => finished(h));
  const names = h.log.filter((e) => e[0] === 'input' && e[1] === '#customerFinderNewCustomerName' && e[3] !== null).map((e) => e[2]);
  assert.equal(names.at(-1), 'Jordan Ellis');
  assert.equal(new Set(names).size, names.length, 'no character typed twice');
});

test('Q18 2A: Replay and the chapter controls restart in a fresh demonstration (same page, no exit, nothing kept)', async () => {
  const h = stage();
  player(h).open(h.director);
  h.get('#demoStartBtn').click();
  await settle(h, () => h.log.filter((e) => e[0] === 'click').length > 2);
  h.get('#demoReplayBtn').click();
  assert.deepEqual(h.replaced, ['/?demo&chapter=1']);
  h.chapterButtons[3].click();
  assert.deepEqual(h.replaced, ['/?demo&chapter=1', '/?demo&chapter=4']);
  assert.equal(h.log.some((e) => e[0] === 'exit'), false, 'never exits');
});

test('Q18 2A: a chapter jump skips quickly through the earlier chapters on the real screens, then plays at normal pace', async () => {
  const h = stage({ search: '?demo&chapter=4' });
  player(h).open(h.director);
  assert.equal(h.get('#demoIntro').hidden, true, 'a chosen chapter starts without the introduction');
  await settle(h, () => h.log.some((e) => e[0] === 'input' && e[1] === '#quoteMarginPercent'));
  const skipping = h.clock();
  assert.ok(h.log.some((e) => e[0] === 'click' && e[1] === '#customerFinderSubmitNewCustomerBtn'), 'earlier chapters still done through Studio');
  await settle(h, () => finished(h));
  assert.ok(skipping < 15000, `earlier chapters skipped quickly (${skipping} ms)`);
  const journey = player(h).journey;
  const shown = h.log.filter((e) => e[0] === 'caption').map((e) => e[1]);
  const captionsOf = (i) => journey[i].steps.filter((s) => s[0] === 'caption').map((s) => s[1]);
  assert.ok(captionsOf(3).every((c) => shown.includes(c)), 'the chosen chapter plays with all its captions');
  assert.ok([0, 1, 2].every((i) => captionsOf(i).every((c) => !shown.includes(c))), 'skipped chapters show no captions');
  assert.ok(h.clock() - skipping > 8000, 'the chosen chapter plays at watchable pace');
  for (const bad of ['?demo&chapter=9', '?demo&chapter=x', '?demo&chapter=0']) {
    const other = stage({ search: bad });
    player(other).open(other.director);
    assert.equal(other.get('#demoIntro').hidden, false, `${bad} shows the introduction`);
  }
});

test('Q18 2A: no separate demonstration maths and no direct data changes - figures come from Studio', () => {
  const code = directorSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /quoteMaths|finalCustomerPrice|labourRate\s*\*|unitPrice|unitCost|Store\.set|localStorage|innerHTML/);
  assert.doesNotMatch(code, /\bquote\.[a-zA-Z]+\s*=/, 'never writes the build directly');
});
