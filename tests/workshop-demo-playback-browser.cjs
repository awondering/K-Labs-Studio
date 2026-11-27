// Q44: full playback of the Workshop tools demonstration on the real Studio screens (WebKit).
// Run with: PLAYWRIGHT_MODULE=/path/to/playwright node tests/workshop-demo-playback-browser.cjs   (DEMO_BROWSER=chromium to override)
// Serves the repository from a local HTTP server with every other request refused. Synthetic demonstration data only.
// Checks, at iPhone 13 (390) and iPhone SE (320) sizes and on a Mac: the introduction offers Build a Rod | Components
// Library | Workshop Tools; all eight chapters play to the end on the real tool screens; every figure shown is the tool's
// own engine's figure for the demonstration's measurements (Guide Setup's calcGuideLayout and orientation, Grip Wrap's
// wrap length and cut angles, Diameter & Circumference, the KR chart row in the KR tool's own engine, Thread Design
// Studio's marking steps for the rod size set); each orientation mode and direction is shown; the cut template preview
// opens with its Print hidden; customer, build and component records are unchanged and nothing leaves the page or
// reaches browser storage; captions are never cut off and the page never scrolls sideways; Pause holds everything and
// Play carries on; the visitor's own taps change nothing; the chapter row, Replay and Play-after-finish restart this
// journey from fresh data; Exit leaves Demo Mode.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_MODULE);
const root = path.join(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };
let passed = 0;
const ck = (name, cond, detail) => { assert.ok(cond, `${name}${detail === undefined ? '' : ' ' + JSON.stringify(detail)}`); passed++; console.log('PASS', name); };

const FINISHED = /That's the Workshop, guides to thread design/;
const STOPPED = /^Demonstration paused\. Press Replay/;
// The demonstration's measurements (js/demo-director.js WORKSHOP_JOURNEY).
const GUIDES = { firstGuide: 110, guideCount: 8, targetStripper: 1180 };
const STRAIGHT = { diameter: 26, length: 250, cover: 20, allowance: 8 };
const TAPER = { start: 30, end: 24 };
const KR_ROD = '6\'6"';

function serve() {
  const outside = [];
  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    const url = new URL(req.url, 'http://x');
    const p = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    const file = path.resolve(root, '.' + p);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : fs.readFileSync(file));
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, outside })));
}
const state = (page) => page.evaluate(() => ({
  label: document.getElementById('demoChapterLabel')?.textContent || '',
  caption: document.getElementById('demoCaption')?.textContent || '',
  button: document.getElementById('demoPlayPauseBtn')?.textContent || '',
  writes: window.KLABS_DEMO.writeCount(),
}));

// What the page shows at this moment, from Studio's screens and the embedded tools' own documents.
const sample = (page) => page.evaluate(() => {
  const text = (id) => document.getElementById(id)?.textContent?.trim() || '';
  const frameDoc = (card) => { try { return document.querySelector(`${card} iframe`)?.contentDocument || null; } catch (e) { return null; } };
  const spiral = workshopToolsState.spiral;
  const sheet = document.getElementById('gripTemplatePreviewSheet');
  const printBtn = sheet?.querySelector('[data-grip-template-action="print"]');
  const thread = frameDoc('#workshopToolThreadStudio');
  const kr = frameDoc('#workshopToolKrGuide');
  return {
    label: text('demoChapterLabel'),
    orientation: `${spiral.rodStyle}|${spiral.method}|${spiral.direction}|${text('workshopSpiralMethodNote')}|${text('workshopSpiralVisualDirection')}`,
    template: sheet && !sheet.hidden ? { summary: sheet.querySelector('.grip-template-preview__summary')?.textContent.replace(/\s+/g, ' ') || '', print: !!printBtn && (printBtn.hidden || printBtn.disabled || printBtn.getClientRects().length === 0) } : null,
    circumference: document.getElementById('workshopDcCircumference')?.value || '',
    threadSize: thread?.getElementById('vdi')?.textContent || '',
    threadTitle: thread ? [...thread.querySelectorAll('h3.stepTitle, .phead b')].map((n) => n.textContent.trim()).join(' / ') : '',
    threadMarks: thread ? [...thread.querySelectorAll('section.card')].map((n) => n.textContent.replace(/\s+/g, ' ')).find((t) => /mark every/.test(t)) || '' : '',
    krSummary: kr?.querySelector('.s-sum')?.textContent.replace(/\s+/g, ' ') || '',
    kr: kr && kr.defaultView?.KR ? { stripperIn: kr.defaultView.KR.referenceForRod('6\'6"').stripperIn, pressed: [...kr.querySelectorAll('[data-rod][aria-pressed="true"]')].map((b) => b.getAttribute('data-rod')) } : null,
  };
});

async function playToEnd(page, label, record, limitMs = 360000) {
  const t0 = Date.now();
  const problems = [];
  let last = '';
  for (;;) {
    const s = await state(page);
    if (record) record(await sample(page), s);
    if (s.caption !== last) {
      last = s.caption;
      const fit = await page.evaluate(() => {
        const caption = document.querySelector('.demo-player__caption');
        return { cut: caption.scrollHeight > caption.clientHeight + 1 || caption.scrollWidth > caption.clientWidth + 1, sideways: document.documentElement.scrollWidth > window.innerWidth + 1 };
      });
      if (fit.cut || fit.sideways) problems.push([s.caption, fit]);
    }
    if (s.button === 'Replay' && (FINISHED.test(s.caption) || STOPPED.test(s.caption))) return { seconds: (Date.now() - t0) / 1000, caption: s.caption, problems };
    if (Date.now() - t0 > limitMs) throw new Error(`${label}: did not finish (${s.label} ${s.caption})`);
    await page.waitForTimeout(150);
  }
}

// Every stored record other than Guide Setup's own working layout, to show customers, builds and components are untouched.
const records = (page) => page.evaluate(() => Object.fromEntries(window.KLABS_DEMO.storeKeys().map((k) => [k, JSON.stringify(window.KLABS_DEMO.store.get(k))])));

async function results(page) {
  return page.evaluate(({ GUIDES, STRAIGHT, TAPER }) => {
    const layout = calcGuideLayout(GUIDES.firstGuide, GUIDES.guideCount, GUIDES.targetStripper);
    const cards = [...document.querySelectorAll('#guideSpacingCards > *')].map((c) => c.textContent.replace(/\s+/g, ' ').trim());
    const spiral = workshopToolsState.spiral;
    const grip = workshopToolsState.grip;
    const fmt = (mm) => formatWorkshopMeasurementValue(mm, 'metric', 'decimal', { decimalsMetric: 1, decimalsImperial: 3 });
    return {
      guideState: { firstGuide: state.firstGuide, guideCount: state.guideCount, targetStripper: state.targetStripper },
      expectedPositions: layout.rows.map((r) => Math.round(r.cum)),
      cards,
      spiral: { rodStyle: spiral.rodStyle, method: spiral.method, direction: spiral.direction, angles: spiral.guides.map((g) => g.angleDeg), positions: spiral.guides.map((g) => Math.round(g.positionMm)) },
      grip: { ...grip },
      // Grip Wrap's own engine for the tapered grip; the straight grip by its formula (Studio renders it inline).
      taperRequired: fmt(taperSpiralWrapLengthMm(TAPER.start, TAPER.end, STRAIGHT.length, STRAIGHT.cover) * (1 + STRAIGHT.allowance / 100)),
      taperStart: gripCutAngleLabel(gripCutAngleDegrees(Math.PI * TAPER.start, STRAIGHT.cover)),
      taperFinish: gripCutAngleLabel(gripCutAngleDegrees(Math.PI * TAPER.end, STRAIGHT.cover)),
      straightStart: gripCutAngleLabel(gripCutAngleDegrees(Math.PI * STRAIGHT.diameter, STRAIGHT.cover)),
      fmtStraight: fmt((STRAIGHT.length / STRAIGHT.cover) * Math.hypot(Math.PI * STRAIGHT.diameter, STRAIGHT.cover) * (1 + STRAIGHT.allowance / 100)),
      shown: {
        required: document.getElementById('workshopGripMaterialRequired')?.textContent.trim(),
        start: document.getElementById('workshopGripStartCutAngle')?.textContent.trim(),
        finish: document.getElementById('workshopGripFinishCutAngle')?.textContent.trim(),
        dcDiameter: document.getElementById('workshopDcDiameter')?.value,
        dcCircumference: document.getElementById('workshopDcCircumference')?.value,
        wrapLength: document.getElementById('workshopDcWrapLength')?.textContent.trim(),
      },
      dc: { ...workshopToolsState.diameter },
      storage: (() => { try { return window.localStorage.length; } catch (e) { return 'blocked'; } })(),
      isolated: window.KLABS_DEMO.isolated,
      sync: !!window.KLABS_SYNC || !!window.KLABS_SUPABASE_CLIENT,
    };
  }, { GUIDES, STRAIGHT, TAPER });
}

async function run() {
  const { server, outside } = await serve();
  const base = `http://127.0.0.1:${server.address().port}/`;
  const engine = playwright[process.env.DEMO_BROWSER || 'webkit'];
  const browser = await engine.launch();
  const open = async (viewport) => {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block', hasTouch: viewport.width < 600, isMobile: viewport.width < 600 && (process.env.DEMO_BROWSER || 'webkit') !== 'webkit' ? true : undefined });
    await context.route(/.*/, (r) => { const u = r.request().url(); if (u.startsWith(base)) return r.continue(); outside.push(u); return r.abort(); });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (/demonstration stopped/i.test(m.text())) errors.push(m.text()); });
    return { context, page, errors };
  };
  try {
    for (const [name, viewport] of [['iPhone 13', { width: 390, height: 844 }], ['iPhone SE', { width: 320, height: 568 }]]) {
      const { context, page, errors } = await open(viewport);
      await page.goto(`${base}?demo`);
      await page.waitForSelector('#demoIntro:not([hidden])');
      const intro = await page.evaluate(() => {
        const ids = ['demoStartBtn', 'demoStartComponentsBtn', 'demoStartWorkshopBtn'];
        return {
          labels: ids.map((id) => document.getElementById(id).textContent),
          heights: ids.map((id) => Math.round(document.getElementById(id).getBoundingClientRect().height)),
          visible: ids.every((id) => document.getElementById(id).getClientRects().length > 0),
          sideways: document.documentElement.scrollWidth > window.innerWidth + 1,
        };
      });
      ck(`${name}: the introduction offers Build a Rod | Components Library | Workshop Tools, each a full-size touch target`,
        JSON.stringify(intro.labels) === JSON.stringify(['BUILD A ROD', 'COMPONENTS LIBRARY', 'WORKSHOP TOOLS']) && intro.visible && intro.heights.every((h) => h >= 44) && !intro.sideways, intro);
      // The Workshop Tools choice can be reached on the smallest screen (the introduction scrolls if it must).
      await page.evaluate(() => document.getElementById('demoStartWorkshopBtn').scrollIntoView({ block: 'center' }));
      const reachable = await page.evaluate(() => { const r = document.getElementById('demoStartWorkshopBtn').getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; });
      ck(`${name}: Workshop Tools is reachable on screen`, reachable);
      const before = await records(page);
      const started = Date.now();
      await page.click('#demoStartWorkshopBtn');
      const rows = await page.evaluate(() => ({
        workshop: [...document.querySelectorAll('[data-demo-tour-chapters="workshop"] [data-demo-workshop-chapter]')].map((b) => b.textContent),
        workshopShown: !document.querySelector('[data-demo-tour-chapters="workshop"]').hidden,
        others: !document.querySelector('[data-demo-chapter]').closest('ol').hidden || !document.querySelector('[data-demo-tour-chapters="components"]').hidden,
      }));
      ck(`${name}: the eight-chapter Workshop row replaces the others`, rows.workshopShown && !rows.others && rows.workshop.length === 8, rows);

      // Pause during Orientation: nothing moves and nothing is written; then Play.
      await page.waitForFunction(() => /^2\/8/.test(document.getElementById('demoChapterLabel').textContent), null, { timeout: 120000 });
      await page.waitForTimeout(1500);
      const pausedAt = Date.now();
      await page.click('#demoPlayPauseBtn');
      await page.waitForTimeout(2500);
      const held = await state(page);
      const heldOrientation = (await sample(page)).orientation;
      await page.waitForTimeout(2500);
      const still = await state(page);
      const stillOrientation = (await sample(page)).orientation;
      ck(`${name}: Pause holds the demonstration and its tool`, held.button === 'Play' && /^Paused/.test(still.caption) && held.writes === still.writes && heldOrientation === stillOrientation, [held, still, heldOrientation, stillOrientation]);
      await page.mouse.click(viewport.width / 2, viewport.height / 2);
      await page.waitForTimeout(500);
      ck(`${name}: the visitor's own tap changes nothing`, (await state(page)).writes === still.writes && (await sample(page)).orientation === stillOrientation);
      await page.click('#demoPlayPauseBtn');
      const pausedFor = Date.now() - pausedAt;

      const seen = { orientation: new Set(), template: null, circumference: new Set(), threadSize: new Set(), threadTitles: new Set(), threadMarks: '', krSummary: [], kr: null };
      const played = await playToEnd(page, name, (s) => {
        if (/^2\/8/.test(s.label)) seen.orientation.add(s.orientation);
        if (s.template) seen.template = s.template;
        if (/^6\/8/.test(s.label) && s.circumference) seen.circumference.add(s.circumference);
        if (s.threadSize) seen.threadSize.add(s.threadSize);
        if (s.threadTitle) seen.threadTitles.add(s.threadTitle);
        if (s.threadMarks) seen.threadMarks = s.threadMarks;
        if (s.krSummary && seen.krSummary.at(-1) !== s.krSummary) seen.krSummary.push(s.krSummary);
        if (s.kr && s.krSummary) seen.kr = s.kr;
      });
      const playingSeconds = (Date.now() - started - pausedFor) / 1000;
      ck(`${name}: all eight chapters play to the end`, FINISHED.test(played.caption) && errors.length === 0, [played.caption, errors]);
      ck(`${name}: no caption is cut off and the page never scrolls sideways`, played.problems.length === 0, played.problems);
      const r = await results(page);

      // 1-3 Guide Setup: the entries reached the engine, and the placement list is calcGuideLayout's.
      ck(`${name}: Spacing entered 8 guides, first at 110 mm, stripper at 1180 mm`, JSON.stringify(r.guideState) === JSON.stringify(GUIDES), r.guideState);
      const cardPositions = r.cards.map((c) => Number((/^Guide \d+\s*(?:Stripper\s*)?(\d+)/i.exec(c) || [])[1]));
      ck(`${name}: Placement lists each guide at calcGuideLayout's position`, cardPositions.length === 8 && JSON.stringify(cardPositions) === JSON.stringify(r.expectedPositions) && r.expectedPositions.at(-1) === 1180, [r.cards, r.expectedPositions]);
      const shownAngles = r.cards.map((c) => Number((/(\d+)°/.exec(c) || [])[1]));
      ck(`${name}: Placement shows each guide's turn from the orientation engine`, JSON.stringify(shownAngles) === JSON.stringify(r.spiral.angles) && JSON.stringify(r.spiral.positions) === JSON.stringify(r.expectedPositions), [shownAngles, r.spiral]);
      const modes = [...seen.orientation].map((o) => o.split('|').slice(0, 3).join('|'));
      const wanted = ['spinning|standard|left', 'casting|standard|left', 'casting|progressive|left', 'casting|progressive|right', 'casting|acute|right', 'casting|offset|right'];
      ck(`${name}: Orientation showed spinning, casting Standard, Progressive left and right, Acute and Offset`, wanted.every((w) => modes.includes(w)), modes);
      const notes = [...seen.orientation].map((o) => o.split('|')[3]);
      ck(`${name}: each mode's own explanation was shown`, ['Spinning uses Standard', 'All guides on the reel side', 'Gradual transition', 'Quick transition', 'Stripper set off the reel line'].every((t) => notes.some((n) => n.includes(t))), notes);
      ck(`${name}: the layout ends Progressive, spiralling right, on a casting rod`, r.spiral.rodStyle === 'casting' && r.spiral.method === 'progressive' && r.spiral.direction === 'right', r.spiral);

      // 4-5 Grip Wrap.
      ck(`${name}: the grip entries reached Grip Wrap`, r.grip.straightDiameterMm === 26 && r.grip.lengthMm === 250 && r.grip.coverWidthMm === 20 && r.grip.allowancePercent === 8 && r.grip.startDiameterMm === 30 && r.grip.endDiameterMm === 24 && r.grip.profile === 'tapered', r.grip);
      ck(`${name}: Tapered grip shows Grip Wrap's material and both cut angles`, r.shown.required === r.taperRequired && r.shown.start === r.taperStart && r.shown.finish === r.taperFinish, [r.shown, r.taperRequired, r.taperStart, r.taperFinish]);
      ck(`${name}: the cut template preview opened for the tapered grip, with Print hidden`, !!seen.template && /Tapered/i.test(seen.template.summary) && seen.template.summary.includes(r.taperRequired) && seen.template.print, seen.template);

      // 6 Diameter & Circumference: both directions and the wraps.
      ck(`${name}: 12.5 mm diameter gave its circumference`, [...seen.circumference].includes((12.5 * Math.PI).toFixed(1)), [...seen.circumference]);
      ck(`${name}: 50 mm circumference gave the diameter, and two wraps the thread length`, r.dc.lastEdited === 'circumference' && Math.abs(r.dc.diameterMm - 50 / Math.PI) < 1e-9 && r.shown.dcDiameter === (50 / Math.PI).toFixed(1) && r.dc.wraps === 2 && r.shown.wrapLength === '100 mm', [r.dc, r.shown]);

      // 7 KR Guide Layout: the 6'6" chart row in the KR tool's own engine.
      const strip = seen.kr && (seen.kr.stripperIn * 25.4).toFixed(1);
      ck(`${name}: KR Guide Layout moved from 7' to the 6'6" chart row, its stripper from the KR engine's chart row`, !!seen.kr && seen.kr.pressed.length === 1 && seen.kr.pressed[0] === KR_ROD && seen.krSummary.length >= 2 && seen.krSummary.at(-1).includes(`${strip} from stem`) && !seen.krSummary[0].includes(`${strip} from stem`), [seen.kr, seen.krSummary]);

      // 8 Thread Design Studio.
      ck(`${name}: Thread Design set the rod to 8.5 mm before marking`, seen.threadSize.has('8.5 mmrod diameter'), [...seen.threadSize]);
      const titles = [...seen.threadTitles].join(' | ');
      ck(`${name}: Thread Design stepped through the marking steps to the first pass`, ['Get your threads ready', 'Wrap the underwrap', 'Find the two centre lines', 'Mark the crossing points', 'Set the turn-around tape'].every((t) => titles.includes(t)) && /Pass 1 of 9/.test(titles), titles);
      ck(`${name}: the crossing-point marks are given for the measured rod`, /Line A: mark every [\d.]+ mm/.test(seen.threadMarks), seen.threadMarks);

      ck(`${name}: about three minutes of playing time`, playingSeconds > 140 && playingSeconds < 260, playingSeconds);
      // Records: customers, builds, components and settings unchanged; only Guide Setup's own working layout may change.
      const after = await records(page);
      const changed = Object.keys({ ...before, ...after }).filter((k) => before[k] !== after[k]);
      // klabs-studio-state is Guide Setup's own working layout (js/ui.js save()): only its three entries may differ.
      const layoutDiff = (() => {
        // Studio's default when the record is not stored yet (js/ui.js).
        const b = JSON.parse(before['klabs-studio-state'] || '{"firstGuide":105,"guideCount":9,"targetStripper":1260,"locked":false,"workshopIndex":0}');
        const a = JSON.parse(after['klabs-studio-state'] || '{}');
        return Object.keys({ ...b, ...a }).filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k]));
      })();
      ck(`${name}: no customer, build, component or settings record changed (only Guide Setup's working layout, in memory)`,
        changed.every((k) => k === 'klabs-studio-state') && layoutDiff.every((k) => ['firstGuide', 'guideCount', 'targetStripper'].includes(k)), [changed, layoutDiff]);
      ck(`${name}: isolated - no storage, no sync, no outside requests`, r.isolated === true && !r.sync && (r.storage === 0 || r.storage === 'blocked') && outside.length === 0, [r.isolated, r.sync, r.storage, outside.slice(0, 3)]);

      if (name === 'iPhone 13') {
        await page.click('[data-demo-workshop-chapter="6"]');
        await page.waitForFunction(() => /^6\/8 Diameter/.test(document.getElementById('demoChapterLabel')?.textContent || ''), null, { timeout: 120000 });
        ck(`${name}: a chapter button plays that chapter of the Workshop tour`, (await page.evaluate(() => window.location.search)) === '?demo');
        await page.click('#demoReplayBtn');
        await page.waitForFunction(() => /^1\/8 Spacing/.test(document.getElementById('demoChapterLabel')?.textContent || ''), null, { timeout: 60000 });
        const fresh = await page.evaluate(() => ({ guideCount: state.guideCount, firstGuide: state.firstGuide, method: workshopToolsState.spiral.method, grip: workshopToolsState.grip.straightDiameterMm }));
        ck(`${name}: Replay restarts the Workshop tour from fresh data`, fresh.guideCount === 9 && fresh.firstGuide === 105 && fresh.grip === 28, fresh);
        await page.click('#demoPlayerExitBtn');
        await page.waitForFunction(() => !/demo/.test(window.location.search), null, { timeout: 30000 });
        ck(`${name}: Exit leaves Demo Mode`, !(await page.evaluate(() => document.documentElement.classList.contains('klabs-demo'))));
      } else {
        await page.click('#demoPlayPauseBtn');
        await page.waitForFunction(() => /^1\/8 Spacing/.test(document.getElementById('demoChapterLabel')?.textContent || ''), null, { timeout: 60000 });
        ck(`${name}: Replay (the Play button once finished) restarts the Workshop tour`, true);
      }
      await context.close();
    }
    // Mac: the slim dock with eight chapters; the KR and Thread Design chapters play to the end.
    const { context, page, errors } = await open({ width: 1280, height: 860 });
    await page.goto(`${base}?demo&tour=workshop&chapter=7`);
    await page.waitForFunction(() => /^7\/8 KR layout/.test(document.getElementById('demoChapterLabel')?.textContent || ''), null, { timeout: 180000 });
    const mac = await page.evaluate(() => ({ dock: document.getElementById('demoModeBar').getBoundingClientRect().height, chapters: [...document.querySelectorAll('[data-demo-workshop-chapter]')].filter((b) => b.getClientRects().length).length }));
    ck('Mac: the dock shows the eight Workshop chapters and stays slim', mac.chapters === 8 && mac.dock < 140, mac);
    const end = await playToEnd(page, 'Mac');
    ck('Mac: chapters 7 and 8 play to the end', FINISHED.test(end.caption) && errors.length === 0 && end.problems.length === 0, [end.caption, errors, end.problems]);
    await context.close();
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`workshop-demo-playback-browser: ${passed} checks passed`);
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
