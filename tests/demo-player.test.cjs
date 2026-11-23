// Q18 Phase 2A/2B: the demonstration player and the scripted journey (steps 1-10).
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
function stage({ search = '?demo', nearestFails = [], coveredOnce = [], localDay = null } = {}) {
  const log = [];
  // Phase 3 review: the director's watchdog timer does not drive the virtual clock; it fires once the clock has reached
  // it. stall: once stall.when(log) is true the director's own timers never fire (a step that cannot finish) until
  // stall.release() - h.advance(ms) moves the clock on meanwhile.
  const watchdogs = [];
  const stall = { when: null, held: [] };
  const fireDue = () => { for (const w of watchdogs.splice(0)) { if (w.due <= clock) setImmediate(w.fn); else watchdogs.push(w); } };
  const busy = { studio: 0, writes: 0 };
  const slow = { turns: 0 };
  // Phase 3: every tap and every typed character, with whether its element was highlighted and fully in view then.
  const acts = [];
  const elements = new Map();
  let clock = 0;
  const make = (key) => {
    const el = {
      key, type: key === '#quoteEstimatedCompletionDate' ? 'date' : '', hidden: false, disabled: false, value: '', textContent: '', isConnected: true, listeners: {}, attributes: {},
      style: {}, scrollTop: 0, scrollHeight: 2000, clientHeight: 600,
      dataset: {},
      addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
      dispatchEvent(event) {
        if (event.type === 'input') { log.push(['input', key, this.value, event.data ?? null]); act(this, 'input'); }
        if (event.type === 'change') log.push(['change', key, this.value]);
        (this.listeners[event.type] || []).forEach((fn) => fn(event));
        return true;
      },
      click() { log.push(['click', key]); act(this, 'click'); (this.listeners.click || []).forEach((fn) => fn({ type: 'click', target: this, isTrusted: false })); },
      closest() { return null; },
      getClientRects() { return this.hidden ? [] : [{}]; },
      // Phase 3: Studio's controls start below the visible page. Scrolling one into view brings it fully on screen - at
      // once, or with a smooth scroll a few position readings later (as a browser's smooth scroll moves over time).
      // underDock: on screen, but under the dock across the top of the page (not in view until scrolled down).
      inView: false, arriving: 0, underDock: false,
      getBoundingClientRect() {
        if (this.arriving > 0 && --this.arriving === 0) this.inView = true;
        const top = this.underDock ? 40 : this.inView ? 300 : this.arriving > 0 ? 300 + this.arriving * 200 : 2000;
        return { top, bottom: top + 80, left: 10, right: 310, width: 300, height: 80 };
      },
      // Phase 3 review: the alignment asked for is logged; nearestFails lists controls a smallest scroll leaves out of view.
      scrollIntoView(options) { log.push(['into-view', key, options && options.block]); if (options && options.block === 'nearest' && nearestFails.includes(key)) return; this.underDock = false; if (options && options.behavior === 'smooth' && !this.inView) this.arriving = 4; else this.inView = true; }, scrollTo(opts) { this.scrollTop = opts && typeof opts.top === 'number' ? opts.top : this.scrollTop; },
      // coveredOnce: once highlighted, something of Studio's floats over the control until it is scrolled again.
      focus() {}, setAttribute(name, value) { this.attributes[name] = String(value); if (name === 'data-demo-highlight' && coveredOnce.includes(key) && !this.wasCovered) { this.wasCovered = true; this.underDock = true; } }, getAttribute(name) { return this.attributes[name] ?? null; },
      removeAttribute(name) { delete this.attributes[name]; },
      toggleAttribute(name, on) { if (on) this.attributes[name] = ''; else delete this.attributes[name]; },
      querySelectorAll() { return []; },
      classList: { add() {}, remove() {}, toggle() {} },
    };
    elements.set(key, el);
    // As in Studio's component library: tapping a component chooses it at Qty 1 and its + adds one, before Add to Build.
    const leaf = /^#choicePickerList \[data-choice-option=(".*")\]$/.exec(key);
    if (leaf) el.listeners.click = [() => { const v = get(`#choicePickerList .component-sheet__row--pick[data-pick-name=${leaf[1]}] .component-pick__value`); if (!Number(v.textContent)) v.textContent = '1'; }];
    const plus = /^(#choicePickerList \.component-sheet__row--pick\[data-pick-name=".*"\]) \[data-pick-step="1"\]$/.exec(key);
    if (plus) el.listeners.click = [() => { const v = get(`${plus[1]} .component-pick__value`); v.textContent = String(Number(v.textContent || 0) + 1); }];
    return el;
  };
  const act = (el, kind) => acts.push({ kind, key: el.key, at: clock, highlighted: 'data-demo-highlight' in el.attributes, inView: el.inView && !el.underDock });
  const get = (key) => elements.get(key) || make(key);
  // The journey's "wait until" checks: after the customer is created the new build shows Jordan Ellis and a quote
  // number; the expanded/collapsed state of sections follows what the director tapped.
  get('#quoteCustomerName').value = 'Jordan Ellis';
  get('#workshopBuildLifecycleStatus').textContent = 'Quote';
  // Phase 3: a pricing field starts on screen but under the dock - it is not in view until it is scrolled down.
  // Q23: the Rod Price field (the margin field before the pricing simplification).
  get('#quoteTotal').underDock = true;
  // 2B: what Studio does on screen when the director taps through steps 6-10 (sheets and forms opening and closing,
  // the job's status changing, the invoice being issued).
  const show = (key, on) => { get(key).hidden = !on; };
  const reactions = {
    '#viewQuoteBtn': () => show('#viewQuoteSheet', true),
    '#viewQuoteCloseBtn': () => show('#viewQuoteSheet', false),
    '#confirmBuildBtn': () => show('#confirmSheet', true),
    '#confirmSheet [data-confirm-action="confirm"]': () => { show('#confirmSheet', false); get('#workshopBuildLifecycleStatus').textContent = 'Active'; },
    '#quoteRecordPaymentBtn': () => show('#quoteBalanceReceivedForm', true),
    '#quoteBalanceReceivedSave': () => show('#quoteBalanceReceivedForm', false),
    '#toggleCurrentBuildStatusBtn': () => { get('#workshopBuildLifecycleStatus').textContent = 'Complete'; },
    '#viewInvoicePreviewBtn': () => show('#invoicePreviewSheet', true),
    '#invoicePreviewSheet [data-invoice-preview-action="issue"]': () => show('#confirmSheet', true),
    '#confirmSheet [data-confirm-action="issue"]': () => { show('#confirmSheet', false); get('#invoicePreviewBody .invoice-document[data-invoice-issued="true"]').textContent = 'Invoice INV-1046'; },
    '#invoicePreviewSheet .invoice-preview__actions [data-invoice-preview-action="close"]': () => show('#invoicePreviewSheet', false),
  };
  for (const [key, react] of Object.entries(reactions)) get(key).listeners.click = [react];
  // Q23 owner corrections: the EVA Grip 75 mm line (index 3) opens; its Quantity field starts at 1 (2 is typed in).
  const gripRow = get('#quoteComponentsList [data-component-action="open-row"][aria-label$=" for EVA Grip 75 mm" i]');
  Object.assign(gripRow.attributes, { 'data-component-index': '3', 'aria-expanded': 'false' });
  const gripQty = get('#quoteComponentsList [data-component-key="quantity"][data-component-index="3"]');
  gripQty.value = '1';
  // Every caption the visitor is shown is recorded.
  const captionEl = get('#demoCaption');
  let captionText = '';
  Object.defineProperty(captionEl, 'textContent', { get: () => captionText, set: (v) => { captionText = String(v); log.push(['caption', captionText, clock]); } });
  // As in index.html and ui.js: the introduction, the player and Studio's sheets start hidden.
  for (const key of ['#demoIntro', '#demoPlayer', '#choicePickerSheet', '#customerFinderSheet', '#viewQuoteSheet', '#confirmSheet', '#quoteBalanceReceivedForm', '#invoicePreviewSheet']) get(key).hidden = true;
  // The dock across the top of the page (the visible page starts below it).
  get('#demoModeBar').getBoundingClientRect = () => ({ top: 0, bottom: 80, left: 0, right: 1280, width: 1280, height: 80 });
  const chapterButtons = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => { const b = get(`chapter-${n}`); b.attributes['data-demo-chapter'] = String(n); return b; });
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
    setTimeout: (fn, ms) => {
      const stack = new Error().stack;
      if (/\barmWatchdog\b/.test(stack)) { watchdogs.push({ due: clock + Math.max(0, Number(ms) || 0), fn }); return 1; }
      if (stall.when && stall.when(log)) { stall.held.push(fn); return 1; }
      clock += Math.max(0, Number(ms) || 0);
      fireDue();
      // slowDirector: the director's own pause-point waits (its wait()) are held back for that many turns, so it runs a
      // long time between pause points; each one is logged when it fires.
      if (slow.turns > 0 && /\bat wait \(/.test(new Error().stack) && !/closeWindowWhenSettled/.test(new Error().stack)) {
        let turns = slow.turns;
        const later = () => { if (--turns > 0) setImmediate(later); else { log.push(['director-wait']); fn(); } };
        setImmediate(later);
      } else setImmediate(fn);
      return 1;
    },
    clearTimeout() {},
    // writeCount: how many changes the demo Store has accepted (a test can add some while a pause is settling).
    KLABS_DEMO: { exit() { log.push(['exit']); }, enterUrl: () => '/?demo', writeCount: () => busy.writes },
    // Studio's own "still saving" signal (an autosave in hand); a test can hold it busy.
    KLABS_UI: { readRecoveryDraft: () => ({ quote: { id: 'build-1' } }), hasUnsavedEdits: () => busy.studio > 0 && busy.studio-- > 0,
      // The new build is named as it is created (no Rename on screen); the heading then shows the name.
      nameCurrentBuild: (name) => { log.push(['name', name]); get('#quoteBuilderTitle').textContent = `Jordan Ellis — ${name}`; return true; } },
    ResizeObserver: class { observe() {} },
    innerWidth: 1280, innerHeight: 860,
    getComputedStyle: () => ({ overflowX: 'visible', overflowY: 'visible', position: 'static', outlineStyle: 'solid' }),
    console: { warn: (...a) => log.push(['warn', a.map(String).join(' ')]), error() {} },
  };
  window.window = window;
  const ClockDate = localDay ? class extends Date {
    constructor(...args) { if (args.length) super(...args); else super(...localDay); }
  } : Date;
  const context = vm.createContext({ window, document, Event: class { constructor(type, o) { this.type = type; Object.assign(this, o); } },
    InputEvent: class { constructor(type, o) { this.type = type; Object.assign(this, o); } }, Promise, Error, Date: ClockDate, String, Number, Math, Object, Array, JSON, Set, Map, setImmediate, console: window.console });
  vm.runInContext(directorSource, context);
  let inStep = 0;
  let suspended = false;
  const steps = [];
  const director = Object.freeze({
    async run(fn) { inStep += 1; steps.push('open'); try { return await fn(); } finally { inStep -= 1; steps.push('close'); } },
    suspend() { suspended = true; steps.push('suspend'); log.push(['suspend']); },
    resume() { suspended = false; steps.push('resume'); log.push(['resume']); },
  });
  const advance = (ms) => { clock += ms; fireDue(); };
  stall.release = () => { const held = stall.held.splice(0); stall.when = null; held.forEach((fn) => setImmediate(fn)); };
  return { window, document, get, log, acts, elements, replaced, steps, director, chapterButtons, busy, slow, stall, advance, clock: () => clock, inStep: () => inStep, writable: () => inStep > 0 && !suspended };
}
const settle = async (h, untilFn, limit = 200000) => { for (let i = 0; i < limit && !untilFn(); i++) await new Promise((r) => setImmediate(r)); };
const player = (h) => h.window.KLABS_DEMO_PLAYER;
// 2B change: the demonstration now finishes after the final invoice and build summary (was: on the customer quote).
const FINISHED = /from enquiry to paid in full/;
// Phase 3 review change: the stopped state reads "Demonstration paused. Press Replay to watch again." (was: "...stopped
// unexpectedly..."), so the end of a run is recognised by either message.
const STOPPED = /^Demonstration paused\. Press Replay/;
const finished = (h) => FINISHED.test(h.get('#demoCaption').textContent) || STOPPED.test(h.get('#demoCaption').textContent);
const flatJourney = (h) => player(h).journey.flatMap((c, i) => c.steps.map((s) => ({ chapter: i + 1, step: s })));

test('Q18 2A/2B: the journey has ten chapters in workflow order, each with short plain-language captions', () => {
  const h = stage();
  const journey = player(h).journey;
  // 2B change: five more chapters (was: the first five only).
  assert.deepEqual(JSON.parse(JSON.stringify(journey.map((c) => c.title))), ['Enquiry', 'Rod spec', 'Components', 'Pricing', 'Quote',
    'Accepted', 'Deposit', 'Workshop', 'Final payment', 'Invoice']);
  for (const chapter of journey) {
    const captions = chapter.steps.filter((s) => s[0] === 'caption').map((s) => s[1]);
    assert.ok(captions.length >= 2, `${chapter.title} has captions`);
    for (const text of captions) {
      // Phase 3 change: at most 64 characters (2B: 90; 2A: 120) - short and plain; the browser test checks none is cut off.
      assert.ok(text.length <= 64, `short caption (${text.length}): ${text}`);
      assert.doesNotMatch(text, /\b(click|DOM|director|script|selector|field id|input event|quoteMaths|API)\b/i, `workshop language: ${text}`);
    }
  }
  assert.ok(Object.isFrozen(journey) && journey.every((c) => Object.isFrozen(c) && Object.isFrozen(c.steps)), 'the journey cannot be changed at run time');
});

test('Rod spec: the reel seat measurement first, then one reference (Rear), then straight on to the grips', () => {
  const steps = Array.from(player(stage()).journey[1].steps);
  const at = (pred) => steps.findIndex(pred);
  const refs = steps.filter(([kind, selector]) => kind === 'tap' && /^#quoteSpecReelSeatRef \[data-layout-seat-ref=/.test(selector));
  assert.deepEqual(refs.map(([, selector]) => selector.match(/"(\w+)"/)[1]), ['rear'], 'no cycling through all three references');
  const seat = at(([kind, selector]) => kind === 'type' && selector === '#quoteSpecReelSeatPosition');
  const ref = steps.indexOf(refs[0]);
  const firstGrip = at(([kind, selector]) => kind === 'type' && /Grip.*Length$/.test(selector));
  assert.ok(seat >= 0 && seat + 1 === ref && ref + 1 === firstGrip, { seat, ref, firstGrip });
  const entries = steps.filter(([kind, selector]) => kind === 'type' && /#quoteSpec(?:ReelSeatPosition|.*Grip.*Length)$/.test(selector));
  assert.deepEqual(Object.fromEntries(entries.map(([, selector, value]) => [selector, value])), {
    '#quoteSpecReelSeatPosition': '330 mm',
    '#quoteSpecRearGripLength': '75 mm',
    '#quoteSpecGripBelowReelSeatLength': '75 mm',
    '#quoteSpecForeGripLength': '100 mm',
  });
});

test('the build is named as it is created: no Rename step anywhere in the demonstration', () => {
  const journey = player(stage()).journey;
  const flat = journey.flatMap((c) => Array.from(c.steps));
  assert.equal(flat.filter(([kind, selector]) => /Rename/.test(String(selector))).length, 0);
  const enquiry = Array.from(journey[0].steps);
  assert.equal(JSON.stringify(enquiry.find(([kind]) => kind === 'name')), JSON.stringify(['name', "7' Snapper Spin"]));
});

test('Components: two identical 75 mm EVA grips are one line at Qty 2, set in the library before Add to Build', () => {
  const steps = Array.from(player(stage()).journey[2].steps);
  const pick = steps.findIndex(([kind, path]) => kind === 'pick' && path[2] === 'EVA Grip 75 mm');
  assert.ok(pick >= 0);
  assert.equal(JSON.stringify(steps[pick]), JSON.stringify(['pick', ['Grips', 'EVA Grips', 'EVA Grip 75 mm'], 2]));
  assert.equal(steps.filter(([kind]) => kind === 'qty').length, 0, 'no second visit to the line to change the quantity');
  assert.equal(steps.filter(([kind, path]) => kind === 'pick' && /Grip/.test(path[2] || '')).length, 1, 'one grip line, not two');
});

test('Q18 2A: the director works the real Studio controls in workflow order: customer, spec, components, pricing, quote', () => {
  const h = stage();
  const flat = player(h).journey.flatMap((c, i) => c.steps.map((s) => ({ chapter: i + 1, step: s })));
  const at = (pred) => flat.findIndex(({ step }) => pred(step));
  const order = [
    at((s) => s[0] === 'tap' && s[1] === '#homeEnterRodBtn'),
    at((s) => s[0] === 'type' && s[1] === '#customerFinderNewCustomerName' && s[2] === 'Jordan Ellis'),
    at((s) => s[0] === 'tap' && s[1] === '#customerFinderSubmitNewCustomerBtn'),
    at((s) => s[0] === 'type' && s[1] === '#quoteSpecFinishedRodLength'),
    at((s) => s[0] === 'pick' && s[1][0] === 'Blanks'),
    // Q23: no labour step; pricing shows the Components Cost, then the Rod Price is typed in.
    at((s) => s[0] === 'show' && [].concat(s[1]).includes('#quoteCostBeforeMarginField')),
    at((s) => s[0] === 'type' && s[1] === '#quoteTotal'),
    at((s) => s[0] === 'tap' && s[1] === '#viewQuoteBtn'),
  ];
  assert.ok(order.every((i) => i >= 0), JSON.stringify(order));
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'workflow order');
  assert.deepEqual(order.map((i) => flat[i].chapter), [1, 1, 1, 2, 3, 4, 4, 5]);
  assert.ok(!flat.some(({ step }) => [].concat(step[1]).some((t) => /quoteLabour/.test(String(t)))), 'no labour steps');
  // Pricing redesign: Advanced pricing (Margin %, then Return $) appears only in a short moment of chapter 4 - opened and
  // closed again without applying, so the Rod price stays as typed.
  const toggles = flat.map((f, i) => [f, i]).filter(([{ step }]) => step[0] === 'tap' && step[1] === '#quoteAdvancedToggle').map(([, i]) => i);
  assert.equal(toggles.length, 2, 'opened once, closed once');
  const [advancedOn, advancedOff] = toggles;
  const targets = flat.map((f, i) => [f, i]).filter(([{ step }]) => [].concat(step[1]).some((t) => /quoteAdvancedTarget|data-advanced-method/.test(String(t))));
  assert.ok(flat[advancedOn].chapter === 4 && flat[advancedOff].chapter === 4);
  assert.ok(targets.length >= 3 && targets.every(([, i]) => i > advancedOn && i < advancedOff), 'methods and targets only inside the Advanced moment');
  assert.ok(!flat.some(({ step }) => step[0] === 'tap' && step[1] === '#quoteAdvancedApply'), 'the demo never applies a proposal');
  // 2B: every control the later chapters use is checked below too.
  assert.ok(flat.length > 100);
  // Every control exists on the real page (index.html) or is built by Studio's own interface (ui.js).
  for (const { step } of flat) {
    if (!['tap', 'type', 'date', 'open', 'until', 'untilHidden', 'untilText', 'untilValue', 'scroll'].includes(step[0])) continue;
    const selector = step[1];
    for (const id of selector.matchAll(/#([A-Za-z0-9]+)/g)) assert.ok(html.includes(`id="${id[1]}"`) || ui.includes(`id="${id[1]}"`) || ui.includes(`'${id[1]}'`), `${selector} exists`);
    for (const attr of selector.matchAll(/\[([a-z-]+)="([^"]+)"\]/g)) {
      // Studio writes some of these from a value (data-invoice-issued="${!preview}"): the attribute itself must exist.
      assert.ok(html.includes(`${attr[1]}="${attr[2]}"`) || ui.includes(`${attr[1]}="${attr[2]}"`) || ui.includes(`id:'${attr[2]}'`) || ui.includes(`${attr[1]}="\${`), `${selector} exists`);
    }
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
  assert.match(h.get('#demoCaption').textContent, FINISHED, `reaches the end: ${h.get('#demoCaption').textContent} ${JSON.stringify(h.log.filter((e) => e[0] === 'warn'))}`);
  assert.ok(h.clock() > 60000, `watchable pacing (${h.clock()} ms of playback)`);
  assert.deepEqual(h.steps, ['open', 'close'], 'one director step for the whole playback; the write window closes at the end');
});

test('Rod spec sets Estimated Completion three weeks ahead using one native date input and change', async () => {
  const h = stage({ localDay: [2026, 11, 20, 22] });
  const field = '#quoteEstimatedCompletionDate';
  assert.match(html, /id="quoteEstimatedCompletionDate" type="date"/);
  player(h).open(h.director);
  h.get('#demoStartBtn').click();
  await settle(h, () => finished(h));
  assert.match(h.get('#demoCaption').textContent, FINISHED);
  assert.deepEqual(h.log.filter(([, selector]) => selector === field).filter(([event]) => event === 'input' || event === 'change'),
    [['input', field, '2027-01-10', null], ['change', field, '2027-01-10']]);
  const at = h.log.findIndex(([kind, selector]) => kind === 'input' && selector === field);
  assert.ok(at < h.log.findIndex(([kind, selector]) => kind === 'click' && selector === '#viewQuoteBtn'));
  assert.ok(h.acts.some(({ key, highlighted, inView }) => key === field && highlighted && inView));
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
  // 2B change: the write window closing a moment into the pause (logged as 'suspend') is not the director doing something.
  const acts = () => h.log.filter((e) => e[0] !== 'suspend' && e[0] !== 'resume').length;
  const before = acts();
  await settle(h, () => false, 3000);
  assert.equal(acts(), before, 'nothing happens while paused');
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
  await settle(h, () => h.log.some((e) => e[0] === 'input' && e[1] === '#quoteTotal'));
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
  // 2B change: chapter 9 now exists, so 11 is the first chapter that does not (was: 9).
  for (const bad of ['?demo&chapter=11', '?demo&chapter=x', '?demo&chapter=0', '?demo&chapter=100']) {
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

// ---- Phase 2B

test('Q18 2B/3: courier delivery - Freight and Packaging are typed in, and the caption says delivery is charged on top with Your Return unchanged', () => {
  const h = stage();
  const flat = flatJourney(h);
  const pricing = flat.filter(({ chapter }) => chapter === 4).map(({ step }) => step);
  assert.ok(!flat.some(({ step }) => step[0] === 'tap' && /collection/.test(step[1])), 'no Customer Collection any more');
  const at = (pred) => pricing.findIndex(pred);
  const price = at((s) => s[0] === 'type' && s[1] === '#quoteTotal');
  const courier = at((s) => s[0] === 'tap' && s[1] === '[data-fulfilment-method="shipping"]');
  const freight = at((s) => s[0] === 'type' && s[1] === '#quoteFreight' && /^\d+$/.test(s[2]));
  const packaging = at((s) => s[0] === 'type' && s[1] === '#quotePackaging' && /^\d+$/.test(s[2]));
  // Q23: plain wording "charged on top ... your return stays the same" (Phase 3: profit and margin), followed by the
  // customer total and Your Return shown highlighted.
  const explained = at((s) => s[0] === 'caption' && /delivery/i.test(s[1]) && /on top/i.test(s[1]) && /return/i.test(s[1]) && /same|unchanged/i.test(s[1]));
  assert.ok(price >= 0 && price < courier && courier < freight && freight < packaging && packaging < explained, JSON.stringify({ price, courier, freight, packaging, explained }));
  assert.equal(pricing[explained + 1][0], 'show', 'the customer total and Your Return shown straight after the caption');
});

test('Q18 2B: steps 6-10 on the real controls in workflow order - accept, deposit, workshop, final payment and complete, invoice and summary', () => {
  const h = stage();
  const flat = flatJourney(h);
  const at = (pred, from = 0) => flat.findIndex((entry, i) => i >= from && pred(entry.step));
  const tapOf = (selector) => (s) => s[0] === 'tap' && s[1] === selector;
  const marks = {};
  marks.confirm = at(tapOf('#confirmBuildBtn'));
  marks.confirmed = at(tapOf('#confirmSheet [data-confirm-action="confirm"]'));
  marks.active = at((s) => s[0] === 'untilText' && s[1] === '#workshopBuildLifecycleStatus' && s[2] === 'Active');
  marks.depositForm = at(tapOf('#quoteRecordPaymentBtn'));
  marks.depositAmount = at((s) => s[0] === 'type' && s[1] === '#quoteBalanceReceivedAmount' && s[2] === '300');
  marks.depositSave = at(tapOf('#quoteBalanceReceivedSave'));
  marks.activeJobs = at(tapOf('[data-studio-action="open-builds"]'));
  marks.openJob = at(tapOf('#buildsScreen [data-build-action="open"]'));
  marks.notes = at((s) => s[0] === 'type' && s[1] === '#quoteSpecBuilderNotes');
  marks.balanceForm = at(tapOf('#quoteRecordPaymentBtn'), marks.notes);
  marks.balanceSave = at(tapOf('#quoteBalanceReceivedSave'), marks.balanceForm);
  marks.complete = at(tapOf('#toggleCurrentBuildStatusBtn'));
  marks.completed = at((s) => s[0] === 'untilText' && s[1] === '#workshopBuildLifecycleStatus' && s[2] === 'Complete');
  marks.invoice = at(tapOf('#viewInvoicePreviewBtn'));
  marks.issue = at(tapOf('#invoicePreviewSheet [data-invoice-preview-action="issue"]'));
  marks.issued = at(tapOf('#confirmSheet [data-confirm-action="issue"]'));
  marks.summary = at(tapOf('#viewQuoteBtn'), marks.issued);
  const order = Object.values(marks);
  assert.ok(order.every((i) => i >= 0), JSON.stringify(marks));
  assert.deepEqual([...order].sort((a, b) => a - b), order, `workflow order ${JSON.stringify(marks)}`);
  assert.deepEqual(Object.fromEntries(Object.entries(marks).map(([k, i]) => [k, flat[i].chapter])), {
    confirm: 6, confirmed: 6, active: 6, depositForm: 7, depositAmount: 7, depositSave: 7, activeJobs: 8, openJob: 8, notes: 8,
    balanceForm: 9, balanceSave: 9, complete: 9, completed: 9, invoice: 10, issue: 10, issued: 10, summary: 10 });
  // The final payment is Studio's own figure for the balance owing: the director never types it.
  const typedAmounts = flat.filter(({ step }) => step[0] === 'type' && step[1] === '#quoteBalanceReceivedAmount');
  assert.equal(typedAmounts.length, 1, 'only the deposit amount is typed');
  // Holds on the key moments: live pricing, delivery, the quote, the final invoice.
  // Phase 3 change: a key-moment hold is 1-2 s, as a plain hold or a highlighted "show" (2B: a hold of at least 1.5 s,
  // and at least 2 s on the invoice).
  const keyHold = ({ step }) => (step[0] === 'hold' && step[1] >= 1000 && step[1] <= 2000) || (step[0] === 'show' && step[2] >= 1000 && step[2] <= 2000);
  const holdAfter = (index) => flat.slice(index + 1, index + 4).some(keyHold);
  assert.ok(holdAfter(at((s) => s[0] === 'type' && s[1] === '#quoteTotal')), 'hold on live pricing');
  assert.ok(holdAfter(at((s) => s[0] === 'scroll' && /viewQuoteSheet/.test(s[1]))), 'hold on the quote');
  assert.ok(flat.slice(marks.issued, marks.summary).some(keyHold), 'hold on the final invoice');
});

test('Q18 2B: the whole journey plays from Start to the final invoice and summary through those controls', async () => {
  const h = stage();
  player(h).open(h.director);
  h.get('#demoStartBtn').click();
  await settle(h, () => finished(h));
  assert.match(h.get('#demoCaption').textContent, FINISHED, JSON.stringify(h.log.filter((e) => e[0] === 'warn')));
  const clicks = h.log.filter((e) => e[0] === 'click').map((e) => e[1]);
  // Pricing redesign: no Deposit | Balance tap - the first payment below the total is the deposit.
  assert.ok(!clicks.some((c) => /data-payment-type/.test(c)), 'no payment-type chooser');
  for (const selector of ['#confirmBuildBtn', '#confirmSheet [data-confirm-action="confirm"]', '#toggleCurrentBuildStatusBtn',
    '#invoicePreviewSheet [data-invoice-preview-action="issue"]', '#confirmSheet [data-confirm-action="issue"]']) {
    assert.ok(clicks.includes(selector), selector);
  }
  assert.equal(clicks.filter((c) => c === '#quoteBalanceReceivedSave').length, 2, 'two payments: the deposit and the balance');
  assert.deepEqual(h.steps, ['open', 'close'], 'one director step for the whole playback');
});

test('Q18 2B: at the end the Pause button becomes Replay, and pressing it restarts at chapter 1 in Demo Mode', async () => {
  const h = stage();
  player(h).open(h.director);
  h.get('#demoStartBtn').click();
  await settle(h, () => h.log.some((e) => e[0] === 'click'));
  assert.equal(h.get('#demoPlayPauseBtn').textContent, 'Pause');
  await settle(h, () => finished(h));
  const button = h.get('#demoPlayPauseBtn');
  assert.equal(button.textContent, 'Replay');
  assert.equal(button.disabled, false, 'it can be pressed');
  assert.equal(h.get('#demoReplayBtn').hidden, true, 'one Replay button, not two');
  button.click();
  assert.deepEqual(h.replaced, ['/?demo&chapter=1']);
  assert.equal(h.log.some((e) => e[0] === 'exit'), false, 'never exits');
});

test('Q18 2B: Pause closes the director\'s write window once Studio has finished saving, and Play reopens it before anything moves', async () => {
  const h = stage();
  player(h).open(h.director);
  h.get('#demoStartBtn').click();
  await settle(h, () => h.log.some((e) => e[0] === 'input' && e[1] === '#customerFinderNewCustomerName' && e[2] === 'Jor'));
  assert.equal(h.writable(), true, 'open while playing');
  h.busy.studio = 3; // Studio is still saving the last change
  h.get('#demoPlayPauseBtn').click();
  assert.equal(h.writable(), true, 'not closed in the middle of Studio saving');
  await settle(h, () => h.steps.includes('suspend'), 5000);
  assert.equal(h.busy.studio, 0, 'closed only after Studio was no longer saving');
  assert.equal(h.writable(), false, 'closed while paused');
  const before = h.log.length;
  await settle(h, () => false, 3000);
  assert.equal(h.log.length, before, 'nothing happens while paused');
  assert.equal(h.writable(), false, 'stays closed for the whole pause');
  h.get('#demoPlayPauseBtn').click();
  assert.equal(h.writable(), true, 'reopened by Play');
  await settle(h, () => h.log.length > before + 3);
  const resumed = h.log.findIndex((e) => e[0] === 'resume');
  assert.ok(resumed >= 0 && resumed === h.log.findIndex((e, i) => i >= before && e[0] !== 'caption' && e[1] !== '#demoPlayPauseBtn'), `reopened before the director moves again ${JSON.stringify(h.log.slice(before - 2, before + 4))}`);
  // A quick Pause and Play before Studio settles leaves the window open, and never closes it after Play.
  h.busy.studio = 2;
  h.get('#demoPlayPauseBtn').click();
  h.get('#demoPlayPauseBtn').click();
  await settle(h, () => false, 300);
  assert.equal(h.inStep(), 1, `still playing: ${h.get('#demoCaption').textContent} ${JSON.stringify(h.log.filter((e) => e[0] === 'warn'))}`);
  assert.equal(h.writable(), true, 'left open after Play');
  assert.equal(h.steps.filter((s) => s === 'suspend').length, 1);
  await settle(h, () => finished(h));
  assert.deepEqual(h.steps, ['open', 'suspend', 'resume', 'close']);
});

test('Q18 2B: the player will not open without a director that can close its write window', () => {
  const h = stage();
  assert.throws(() => player(h).open(Object.freeze({ run: async (f) => f() })), /director is unavailable/);
});

test('Q18 2B/3: one steady typing speed and one short beat; the iPhone strip has its own Exit demo', async () => {
  const h = stage();
  const pace = player(h).pace;
  assert.ok(Object.isFrozen(pace));
  // Phase 3 change: one typing speed and one beat between actions (2B: separate field, tap and chapter gaps, key <= 45).
  assert.equal(pace.field, undefined, 'no separate per-field gap');
  assert.equal(pace.tap, undefined, 'no separate per-tap gap');
  assert.equal(pace.chapter, undefined, 'no separate gap between chapters');
  assert.ok(pace.key >= 40 && pace.key <= 70, `steady, readable typing (${pace.key} ms a character)`);
  assert.ok(pace.beat >= 300 && pace.beat <= 600, `a short beat (${pace.beat} ms)`);
  player(h).open(h.director);
  h.get('#demoPlayerExitBtn').click();
  assert.ok(h.log.some((e) => e[0] === 'exit'));
});

test('Q18 2B: Pause closes the window only once the director has stopped and Studio has made no change for a moment (a save in flight is never cut off)', async () => {
  const h = stage();
  player(h).open(h.director);
  h.get('#demoStartBtn').click();
  await settle(h, () => h.log.some((e) => e[0] === 'input' && e[1] === '#customerFinderNewPhone'));
  h.get('#demoPlayPauseBtn').click();
  // Studio keeps saving for a while after the pause (each settle step it makes another change).
  let changes = 0;
  const startClock = h.clock();
  await settle(h, () => { if (changes < 12) { changes += 1; h.busy.writes += 1; } return h.steps.includes('suspend'); }, 50000);
  assert.ok(h.steps.includes('suspend'), 'closes in the end');
  assert.equal(changes, 12, 'not while Studio was still making changes');
  assert.ok(h.clock() - startClock >= 800, `a quiet moment first (${h.clock() - startClock} ms)`);
  h.get('#demoPlayPauseBtn').click();
  await settle(h, () => finished(h));
  assert.deepEqual(h.steps, ['open', 'suspend', 'resume', 'close']);
});

test('Q18 2B: the write window closes only after the director has actually stopped, even when it runs a long time between pause points', async () => {
  const h = stage();
  player(h).open(h.director);
  h.get('#demoStartBtn').click();
  await settle(h, () => h.log.some((e) => e[0] === 'input' && e[1] === '#customerFinderNewPhone'));
  h.slow.turns = 40; // eight quiet settle checks (800 ms) would fit five times over inside one of the director's waits
  await settle(h, () => h.log.some((e) => e[0] === 'director-wait'));
  await settle(h, () => true); // the director has set its next (held-back) wait
  h.get('#demoPlayPauseBtn').click();
  const from = h.log.length;
  const seen = () => h.log.slice(from).map((e) => e[0]);
  await settle(h, () => seen().includes('suspend') && seen().includes('director-wait'), 50000);
  const after = seen();
  assert.ok(after.includes('suspend'), 'closes in the end');
  assert.ok(after.includes('director-wait'), 'the director was still mid-wait when Pause was pressed');
  assert.ok(after.lastIndexOf('director-wait') < after.indexOf('suspend'), `closed only after the director's last wait finished (${after.join(',')})`);
  h.slow.turns = 0;
  h.get('#demoPlayPauseBtn').click();
  await settle(h, () => finished(h));
  assert.deepEqual(h.steps, ['open', 'suspend', 'resume', 'close']);
});

// ---- Phase 3: pacing, view and highlight.
const playThrough = async () => {
  const h = stage();
  player(h).open(h.director);
  h.get('#demoStartBtn').click();
  await settle(h, () => finished(h));
  assert.match(h.get('#demoCaption').textContent, FINISHED);
  return h;
};
const studioActs = (h) => h.acts.filter((a) => !/^#demo|^chapter-/.test(a.key));

test('Q18 Phase 3: every tap, typed field and selection happens on a highlighted control that is fully in view', async () => {
  const h = await playThrough();
  const acts = studioActs(h);
  assert.ok(acts.length > 300, `the whole journey (${acts.length} actions and characters)`);
  const bad = acts.filter((a) => !a.highlighted || !a.inView);
  assert.deepEqual(bad.slice(0, 5), [], `${bad.length} actions without a highlight or out of view`);
  // Each control is brought into view before it is used, and no highlight is left behind at the end.
  for (const key of new Set(acts.map((a) => a.key))) {
    const firstUse = h.log.findIndex((e) => (e[0] === 'click' || e[0] === 'input') && e[1] === key);
    const intoView = h.log.findIndex((e) => e[0] === 'into-view' && e[1] === key);
    assert.ok(intoView >= 0 && intoView < firstUse, `${key} brought into view before it is used`);
  }
  assert.deepEqual([...h.elements.values()].filter((el) => 'data-demo-highlight' in el.attributes).map((el) => el.key), []);
});

test('Q18 Phase 3: one steady typing speed throughout and the same short beat before every tap', async () => {
  const h = await playThrough();
  const pace = player(h).pace;
  const typed = studioActs(h).filter((a) => a.kind === 'input');
  const gaps = new Set();
  for (let i = 1; i < typed.length; i++) if (typed[i].key === typed[i - 1].key) gaps.add(typed[i].at - typed[i - 1].at);
  // Two typed characters in a row are always the same time apart (a cleared field before typing is the only extra input).
  assert.deepEqual([...gaps].filter((g) => g !== pace.key && g !== 0), [], `typing gaps ${[...gaps]}`);
});

test('Q18 Phase 3: the whole demonstration runs about 3 to 3.5 minutes, with key moments held 1-2 s', async () => {
  const h = await playThrough();
  // The virtual clock leaves out Studio's own work and the browser's scrolling, which the real run adds on top.
  // Q23 final correction adds a short Advanced Pricing moment, so the upper bound is now exactly 3.5 minutes.
  assert.ok(h.clock() >= 165000 && h.clock() <= 210000, `about 3-3.5 minutes of playback (${h.clock()} ms virtual)`);
  const flat = flatJourney(h);
  const holds = flat.filter(({ step }) => step[0] === 'hold').map(({ step }) => step[1]).concat(flat.filter(({ step }) => step[0] === 'show').map(({ step }) => step[2]));
  assert.ok(holds.length >= 5 && holds.every((ms) => ms >= 600 && ms <= 2000), `short holds only ${holds}`);
});

test('Q18 Phase 3: the courier choice is shown and held, then Courier, Freight, Packaging, the delivery total, the customer total and the unchanged Your Return are each highlighted', async () => {
  const h = stage();
  const pricing = flatJourney(h).filter(({ chapter }) => chapter === 4).map(({ step }) => step);
  const at = (pred) => pricing.findIndex(pred);
  const choice = at((s) => s[0] === 'show' && s[1] === '#quoteFulfilmentGroup');
  const courier = at((s) => s[0] === 'tap' && s[1] === '[data-fulfilment-method="shipping"]');
  const freight = at((s) => s[0] === 'type' && s[1] === '#quoteFreight');
  const packaging = at((s) => s[0] === 'type' && s[1] === '#quotePackaging');
  // Pricing redesign: the Total price (with delivery) replaces the separate delivery total and customer total line.
  const total = at((s) => s[0] === 'show' && s[1] === '#quoteTotalPriceRow');
  const onTop = at((s) => s[0] === 'caption' && /on top/i.test(s[1]));
  const profit = at((s) => s[0] === 'show' && Array.isArray(s[1]) && s[1].includes('#quoteTotalPriceRow') && s[1].includes('#quoteEarningsSummary'));
  assert.ok(choice >= 0 && choice < courier && courier < freight && freight < packaging && packaging < total && total < onTop && onTop < profit, JSON.stringify({ choice, courier, freight, packaging, total, onTop, profit }));
  assert.ok(pricing[choice][2] >= 800 && pricing[choice][2] <= 2000, 'a brief hold on the Collection / Courier choice');
  // While playing: each of those is highlighted and in view while it is shown.
  const seen = [];
  const watch = ['#quoteFulfilmentGroup', '#quoteTotalPriceRow', '#quoteEarningsSummary'];
  for (const key of watch) {
    const el = h.get(key);
    el.setAttribute = (name, value) => { el.attributes[name] = String(value); if (name === 'data-demo-highlight') seen.push([key, el.inView]); };
  }
  player(h).open(h.director);
  h.get('#demoStartBtn').click();
  await settle(h, () => finished(h));
  assert.deepEqual(watch.filter((key) => !seen.some(([k, inView]) => k === key && inView)), [], JSON.stringify(seen));
});

test('Q18 Phase 3: the pause, skip, finished and stopped messages are short too', () => {
  const h = stage();
  const messages = player(h).messages;
  assert.ok(Object.isFrozen(messages) && messages.length >= 4);
  for (const text of messages) assert.ok(text.length <= 72, `short message (${text.length}): ${text}`);
  assert.ok(messages.some((m) => /^Paused/.test(m)) && messages.some((m) => /from enquiry to paid in full/.test(m)));
});

test('Q18 Phase 3: while paused the caption is the short pause message on its own', async () => {
  const h = stage();
  player(h).open(h.director);
  h.get('#demoStartBtn').click();
  await settle(h, () => h.log.some((e) => e[0] === 'input' && e[1] === '#customerFinderNewPhone'));
  h.get('#demoPlayPauseBtn').click();
  const paused = h.get('#demoCaption').textContent;
  assert.ok(player(h).messages.includes(paused) && /^Paused/.test(paused), paused);
  h.get('#demoPlayPauseBtn').click();
  assert.match(h.get('#demoCaption').textContent, /add their details/, 'Play puts the caption back');
});

// ---- Phase 3 review: watchdog, scrolling in reading order, pricing by margin or by profit.

test('Q18 Phase 3 review: a step that cannot finish ends in a calm "paused - Replay" state, never a silent hang, and the stuck step can do nothing afterwards', async () => {
  const h = stage();
  const limit = player(h).watchdog;
  assert.ok(limit >= 15000 && limit <= 30000, `a sensible limit for one step (${limit} ms)`);
  player(h).open(h.director);
  h.get('#demoStartBtn').click();
  // The director gets stuck in the middle of typing the customer's phone number.
  h.stall.when = (log) => log.some((e) => e[0] === 'input' && e[1] === '#customerFinderNewPhone' && e[2] === '021');
  await settle(h, () => h.stall.held.length > 0);
  const caption = () => h.get('#demoCaption').textContent;
  h.advance(limit - 1000);
  await settle(h, () => false, 2000);
  assert.doesNotMatch(caption(), STOPPED, 'not before the limit');
  h.advance(2000);
  await settle(h, () => STOPPED.test(caption()), 5000);
  assert.match(caption(), STOPPED);
  assert.ok(player(h).messages.includes(caption()), 'one of the short messages');
  assert.equal(h.get('#demoPlayPauseBtn').textContent, 'Replay');
  assert.equal(h.get('#demoPlayPauseBtn').disabled, false);
  assert.deepEqual(h.steps, ['open', 'close'], 'the write window is closed');
  // The stuck step comes unstuck later: it types and taps nothing more.
  const before = h.log.filter((e) => e[0] === 'input' || e[0] === 'click').length;
  h.stall.release();
  await settle(h, () => false, 5000);
  assert.equal(h.log.filter((e) => e[0] === 'input' || e[0] === 'click').length, before, 'nothing happens after the stop');
  assert.match(caption(), STOPPED);
  h.get('#demoPlayPauseBtn').click();
  assert.deepEqual(h.replaced, ['/?demo&chapter=1'], 'Replay starts again');
});

test('Q18 Phase 3 review: time spent paused does not count towards the watchdog', async () => {
  const h = stage();
  const limit = player(h).watchdog;
  player(h).open(h.director);
  h.get('#demoStartBtn').click();
  await settle(h, () => h.log.some((e) => e[0] === 'input' && e[1] === '#customerFinderNewPhone' && e[2] === '021'));
  h.get('#demoPlayPauseBtn').click();
  h.stall.when = () => true; // nothing of the director's runs while we look
  h.advance(limit * 3);
  await settle(h, () => false, 3000);
  assert.match(h.get('#demoCaption').textContent, /^Paused/, 'still simply paused after a long pause');
  h.stall.release();
  h.get('#demoPlayPauseBtn').click();
  await settle(h, () => finished(h));
  assert.match(h.get('#demoCaption').textContent, FINISHED, 'carries on to the end');
});

test('Q18 Phase 3 review: controls are brought into view with the smallest scroll (reading order), centred only if that is not enough', async () => {
  const h = stage({ nearestFails: ['#quoteFreight', '#quoteCostBeforeMarginField'] });
  player(h).open(h.director);
  h.get('#demoStartBtn').click();
  await settle(h, () => finished(h));
  assert.match(h.get('#demoCaption').textContent, FINISHED);
  const scrolls = h.log.filter((e) => e[0] === 'into-view');
  const firstOf = new Map();
  for (const e of scrolls) if (!firstOf.has(e[1])) firstOf.set(e[1], e[2]);
  assert.deepEqual([...firstOf].filter(([, block]) => block !== 'nearest'), [], 'the first move is always the smallest one');
  // A field to type in, and a figure that is only shown (highlighted, not used).
  for (const key of ['#quoteFreight', '#quoteCostBeforeMarginField']) {
    assert.deepEqual(scrolls.filter((e) => e[1] === key).map((e) => e[2]), ['nearest', 'center'], `${key} centred when the smallest scroll leaves it out of view`);
  }
  assert.ok(studioActs(h).every((a) => a.highlighted && a.inView));
});

// Q23 (replaces "pricing is shown both ways - a margin, then the profit you want"): the simple default pricing.
test('Q23: pricing shows the Components Cost, then the Job Price is typed in with Your Return, one short caption, about 5-8 s', async () => {
  const h = stage();
  const pricing = flatJourney(h).filter(({ chapter }) => chapter === 4).map(({ step }) => step);
  const at = (pred, from = 0) => pricing.findIndex((s, i) => i >= from && pred(s));
  const cost = at((s) => s[0] === 'show' && [].concat(s[1]).includes('#quoteCostBeforeMarginField'));
  const caption = at((s) => s[0] === 'caption' && /job price/i.test(s[1]) && /return/i.test(s[1]));
  const price = at((s) => s[0] === 'type' && s[1] === '#quoteTotal' && /^\d+$/.test(s[2]));
  const shown = at((s) => s[0] === 'show' && [].concat(s[1]).includes('#quoteTotalField') && [].concat(s[1]).includes('#quoteEarningsSummary'), price);
  assert.ok(cost >= 0 && cost < caption && caption < price && price < shown, JSON.stringify({ cost, caption, price, shown }));
  assert.match(pricing[caption][1], /before GST/, 'the price is entered excluding tax');
  assert.equal(pricing.slice(caption + 1, shown).filter((s) => s[0] === 'caption').length, 0, 'one caption');
  // Timed while playing: from that caption to the next one.
  player(h).open(h.director);
  h.get('#demoStartBtn').click();
  await settle(h, () => finished(h));
  const captions = h.log.filter((e) => e[0] === 'caption');
  const i = captions.findIndex((e) => e[1] === pricing[caption][1]);
  const ms = captions[i + 1][2] - captions[i][2];
  assert.ok(ms >= 5000 && ms <= 8000, `about 5-8 s (${ms} ms)`);
  assert.ok(h.log.some((e) => e[0] === 'input' && e[1] === '#quoteTotal' && e[2] === pricing[price][2]), 'the rod price is typed in');
});

test('Q18 Phase 3 review: if something floats over a control after it was brought into view, it is centred before it is used', async () => {
  const h = stage({ coveredOnce: ['#toggleCurrentBuildStatusBtn'] });
  player(h).open(h.director);
  h.get('#demoStartBtn').click();
  await settle(h, () => finished(h));
  assert.match(h.get('#demoCaption').textContent, FINISHED);
  const scrolls = h.log.filter((e) => e[0] === 'into-view' && e[1] === '#toggleCurrentBuildStatusBtn').map((e) => e[2]);
  assert.deepEqual(scrolls, ['nearest', 'center']);
  const tap = studioActs(h).find((a) => a.key === '#toggleCurrentBuildStatusBtn');
  assert.ok(tap && tap.highlighted && tap.inView, JSON.stringify(tap));
});

test('the quantity is typed into the line\'s Quantity field - the +/- steppers stay blocked in Demo Mode and are never used', () => {
  const flat = player(stage()).journey.flatMap((c) => Array.from(c.steps));
  assert.equal(flat.filter((step) => /quantity-(increment|decrement)/.test(JSON.stringify(step))).length, 0);
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'demo-director.js'), 'utf8');
  const fnBody = src.slice(src.indexOf('async function setQuantity'), src.indexOf('async function scrollThrough'));
  assert.match(fnBody, /await type\(field, String\(qty\)\)/);
  assert.doesNotMatch(fnBody, /quantity-increment|component-quantity__step/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'js', 'supabase-client.js'), 'utf8'), /control\.matches\("\.layout-control-card__button, \.component-quantity__step/);
});
