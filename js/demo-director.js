/* Q18 Demo Mode: the demonstration player and its director. Loaded only on a Demo Mode page, after Studio's interface.
 *
 * The director works the real Studio screens the way a person would - it taps real buttons and types into real fields,
 * one character at a time - so Studio's own handlers, checks, pricing (quoteMaths) and saving run exactly as in normal
 * use. It never writes data, works out figures or changes screens directly. Every change happens inside one director
 * step (KLABS_DEMO.claimDirector in js/demo-mode.js); outside it - and while the visitor has paused the demonstration -
 * the demo Store refuses all writes, and the visitor shield turns away the visitor's own taps and typing, so the
 * visitor watches and only the player's controls respond.
 *
 * The journey follows Jordan Ellis's job from enquiry to paid in full: 1 enquiry and customer, 2 rod specification,
 * 3 components and labour, 4 live pricing and courier delivery, 5 the customer quote, 6 the customer accepts (Confirm
 * Build), 7 the deposit, 8 workshop progress, 9 the final payment and Mark Complete, 10 the final invoice and the
 * completed build summary. Payments and the invoice go through Studio's own screens to a local demo-only stand-in for
 * the payment service (js/public-entry.js); every document is shown with a DEMO watermark (css/studio.css).
 * Replay and the chapter controls reload the demonstration page (?demo&chapter=N), so every run starts from the same
 * fresh in-memory data without leaving Demo Mode; chapters before the chosen one are worked through quickly on the
 * same real screens. */
(function () {
  "use strict";
  // Pacing only needs to be watchable (final pacing is Phase 3): routine typing and moves are brisk, and the key
  // moments (live pricing, delivery added separately, the quote, the final invoice) get short holds. Milliseconds.
  const PACE = Object.freeze({ key: 38, field: 260, tap: 380, captionBase: 1100, captionPerChar: 24, chapter: 500, scroll: 2000 });
  const STEP_TIMEOUT_MS = 10000;
  const SETTLE_LIMIT_MS = 5000;
  const RESTING = "Fictional data. Nothing here is saved, sent or synced.";
  const PLAYING = "Demonstration playing. Nothing here is saved, sent or synced.";
  const FINISHED = "That's the whole job, from enquiry to paid in full. Replay, or choose a chapter.";
  const STOPPED = "The demonstration stopped unexpectedly. Replay to try again, or exit the demo.";

  const freeze = (value) => {
    if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  };
  const toggle = (bodyId) => `[aria-controls="${bodyId}"]`;
  // The journey. Steps: caption(text), tap(selector), type(selector, text), open(section toggle), pick([category,
  // subcategory, component]) from the component library, until(selector visible), untilHidden(selector),
  // untilValue(selector, value), untilText(selector, text), scroll(selector) and hold(ms) on a key moment.
  const JOURNEY = freeze([
    { title: "Enquiry", steps: [
      ["caption", "Jordan Ellis wants a new spin rod for snapper and kahawai."],
      ["tap", "#homeEnterRodBtn"],
      ["caption", "Jordan is a new customer, so add their details once."],
      ["tap", "#customerFinderAddNewAction"],
      ["type", "#customerFinderNewCustomerName", "Jordan Ellis"],
      ["type", "#customerFinderNewPhone", "021 555 0142"],
      ["type", "#customerFinderNewEmail", "jordan.ellis@example.com"],
      ["type", "#customerFinderNewAddress1", "8 Dune Street"],
      ["type", "#customerFinderNewSuburb", "Mount Maunganui"],
      ["type", "#customerFinderNewCity", "Tauranga"],
      ["type", "#customerFinderNewRegion", "Bay of Plenty"],
      ["type", "#customerFinderNewPostcode", "3116"],
      ["type", "#customerFinderNewCountry", "New Zealand"],
      ["caption", "Create the customer. Studio opens a new build with its own quote number."],
      ["tap", "#customerFinderSubmitNewCustomerBtn"],
      ["untilHidden", "#customerFinderSheet"],
      ["until", "#workshopScreen.active"],
      ["untilValue", "#quoteCustomerName", "Jordan Ellis"],
    ] },
    { title: "Rod spec", steps: [
      ["caption", "Give the build a name you'll recognise on the bench."],
      ["tap", "#quoteBuildRenameBtn"],
      ["type", "#quoteBuildRenameInput", "7' Snapper Spin"],
      ["tap", "#quoteBuildRenameSave"],
      ["caption", "Open the build details and add a note Jordan will see on the quote."],
      ["open", toggle("workshopBuildSpecsBody")],
      ["type", "#quoteNotes", "Black wraps with gloss finish. Split grip."],
      ["caption", "Record the finished length, the reel seat position and the grip lengths."],
      ["type", "#quoteSpecFinishedRodLength", "2134"],
      ["type", "#quoteSpecReelSeatPosition", "330 mm from butt"],
      ["type", "#quoteSpecRearGripLength", "250"],
      ["type", "#quoteSpecForeGripLength", "110"],
    ] },
    { title: "Components", steps: [
      ["caption", "Pick the parts from the component library. Each brings its cost and sell price."],
      ["open", toggle("workshopComponentsBody")],
      ["pick", ["Blanks", "Spinning Blanks", "7'0\" Medium Spin 6-10 kg"]],
      ["caption", "Guides, reel seat and grip next."],
      ["pick", ["Guides", "Spinning Guide Sets", "Medium Spin Guide Set"]],
      ["pick", ["Reel Seats", "Threaded Reel Seats", "DPS 18"]],
      ["pick", ["Grips", "EVA Grips", "EVA Split Grip"]],
      ["caption", "Then the small parts: winding check and thread."],
      ["pick", ["Winding Checks", "Grip Winding Checks", "Aluminium Winding Check 16 mm"]],
      ["pick", ["Thread", "Nylon", "NCP Nylon Thread A Black"]],
      ["caption", "Add the labour: the workshop's hourly rate times the hours this build takes."],
      ["open", toggle("workshopQuoteSummaryBody")],
      ["type", "#quoteLabourHours", "5"],
    ] },
    { title: "Pricing", steps: [
      ["caption", "Studio prices the job as you go: parts, labour and GST on one screen."],
      ["hold", 1800],
      ["caption", "Set the margin you want. The customer price updates straight away."],
      ["type", "#quoteMarginPercent", "25"],
      ["hold", 1800],
      ["caption", "Jordan wants the rod couriered, so add the freight and packaging."],
      ["tap", "[data-fulfilment-method=\"shipping\"]"],
      ["type", "#quoteFreight", "18"],
      ["type", "#quotePackaging", "12"],
      ["caption", "Delivery is added to the price separately. The rod's target profit stays the same."],
      ["hold", 2600],
    ] },
    { title: "Quote", steps: [
      ["caption", "Open the customer quote: exactly what Jordan will see."],
      ["tap", "#viewQuoteBtn"],
      ["until", "#viewQuoteSheet"],
      ["caption", "Rod, specification, parts, delivery and price, under the workshop's name."],
      ["scroll", "#viewQuoteSheet .component-sheet__body"],
      ["hold", 1600],
      ["caption", "This one is marked DEMO and goes nowhere. In your Studio it's ready to send."],
    ] },
    { title: "Accepted", steps: [
      ["caption", "Jordan accepts the quote. Confirm the build to make it an active job."],
      ["tap", "#viewQuoteCloseBtn"],
      ["untilHidden", "#viewQuoteSheet"],
      ["tap", "#confirmBuildBtn"],
      ["until", "#confirmSheet"],
      ["tap", "#confirmSheet [data-confirm-action=\"confirm\"]"],
      ["untilHidden", "#confirmSheet"],
      ["untilText", "#workshopBuildLifecycleStatus", "Active"],
      ["caption", "Same job, same quote number. It's now Active."],
    ] },
    { title: "Deposit", steps: [
      ["caption", "Jordan pays a $300 deposit by bank transfer. Record it on the job."],
      ["tap", "#quoteRecordPaymentBtn"],
      ["until", "#quoteBalanceReceivedForm"],
      ["tap", "#quotePaymentTypeField [data-payment-type=\"deposit\"]"],
      ["type", "#quoteBalanceReceivedAmount", "300"],
      ["tap", "#quoteBalanceReceivedSave"],
      ["untilHidden", "#quoteBalanceReceivedForm"],
      ["caption", "The deposit is recorded, and the balance owing updates."],
    ] },
    { title: "Workshop", steps: [
      ["caption", "Into the workshop. The job waits in Active Jobs until it's finished."],
      ["tap", "[data-nav=\"workshopScreen\"]"],
      ["tap", "[data-studio-action=\"open-builds\"]"],
      ["until", "#buildsScreen.active"],
      ["caption", "Open Jordan's job from the list."],
      ["tap", "#buildsScreen [data-build-action=\"open\"]"],
      ["until", "#workshopScreen.active"],
      ["untilValue", "#quoteCustomerName", "Jordan Ellis"],
      ["caption", "Keep private workshop notes as the rod comes together. Jordan never sees these."],
      ["open", toggle("workshopBuildSpecsBody")],
      ["type", "#quoteSpecBuilderNotes", "Blank spined. Guides wrapped and coated. Grip and reel seat fitted."],
    ] },
    { title: "Final payment", steps: [
      ["caption", "The rod is finished, and Jordan pays the balance."],
      ["open", toggle("workshopQuoteSummaryBody")],
      ["tap", "#quoteRecordPaymentBtn"],
      ["until", "#quoteBalanceReceivedForm"],
      ["caption", "Studio fills in the balance still owing."],
      ["tap", "#quoteBalanceReceivedSave"],
      ["untilHidden", "#quoteBalanceReceivedForm"],
      ["caption", "Paid in full. Mark the build complete."],
      ["tap", "#toggleCurrentBuildStatusBtn"],
      ["untilText", "#workshopBuildLifecycleStatus", "Complete"],
    ] },
    { title: "Invoice", steps: [
      ["caption", "Issue the final invoice. It shows both payments and nothing owing."],
      ["tap", "#viewInvoicePreviewBtn"],
      ["until", "#invoicePreviewSheet"],
      ["tap", "#invoicePreviewSheet [data-invoice-preview-action=\"issue\"]"],
      ["until", "#confirmSheet"],
      ["tap", "#confirmSheet [data-confirm-action=\"issue\"]"],
      ["untilText", "#invoicePreviewBody .invoice-document[data-invoice-issued=\"true\"]", "Invoice"],
      ["caption", "Marked DEMO here. In your Studio it's ready to print or send."],
      ["hold", 2600],
      ["tap", "#invoicePreviewSheet .invoice-preview__actions [data-invoice-preview-action=\"close\"]"],
      ["untilHidden", "#invoicePreviewSheet"],
      ["caption", "And the completed build summary, for Jordan and your records."],
      ["tap", "#viewQuoteBtn"],
      ["until", "#viewQuoteSheet"],
      ["scroll", "#viewQuoteSheet .component-sheet__body"],
      ["hold", 1400],
    ] },
  ]);

  const byId = (id) => document.getElementById(id);
  const visible = (el) => !!el && el.isConnected && !el.hidden && !el.closest("[hidden]") && el.getClientRects().length > 0;
  const cssString = (text) => `"${String(text).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

  // Playback state. The director only moves while playing; a pause can fall anywhere, even mid-word.
  let paused = false;
  let skipping = false;
  let resume = [];
  const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
  // parked: the director has reached a pause point and stopped; the write window closes only after that.
  let parked = false;
  const gate = () => (paused ? new Promise((resolve) => { parked = true; resume.push(resolve); }) : Promise.resolve());
  async function wait(ms) {
    let remaining = skipping ? 0 : Math.max(0, ms);
    await gate();
    while (remaining > 0) {
      const slice = Math.min(remaining, 100);
      await sleep(slice);
      remaining -= slice;
      await gate();
    }
  }
  async function waitFor(check, label) {
    let waited = 0;
    for (;;) {
      await gate();
      const result = check();
      if (result) return result;
      if (waited >= STEP_TIMEOUT_MS) throw new Error(`The demonstration could not find ${label}.`);
      await sleep(50);
      waited += 50;
    }
  }
  async function control(selector) {
    const el = await waitFor(() => { const found = document.querySelector(selector); return visible(found) ? found : null; }, selector);
    if (typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "center", behavior: skipping ? "auto" : "smooth" });
    await wait(PACE.tap);
    return el;
  }
  async function tap(selector) {
    const el = await control(selector);
    if (el.disabled) throw new Error(`${selector} is not available.`);
    el.click();
    await wait(PACE.tap);
  }
  // Typed one character at a time. The director keeps its own copy of what it has typed, because Studio may reformat a
  // field after each character (a margin of "2" is shown as "2.0" until the "5" arrives).
  async function type(selector, text) {
    const el = await control(selector);
    let typed = "";
    el.value = "";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    for (const character of String(text)) {
      await wait(PACE.key);
      typed += character;
      el.value = typed;
      el.dispatchEvent(new InputEvent("input", { bubbles: true, data: character, inputType: "insertText" }));
    }
    el.dispatchEvent(new Event("change", { bubbles: true }));
    await wait(PACE.field);
  }
  async function pick(path) {
    await tap("#addComponentBtn");
    for (const name of path) await tap(`#choicePickerList [data-choice-option=${cssString(name)}]`);
    await waitFor(() => !visible(byId("choicePickerSheet")), "the component library closing");
    await wait(PACE.tap);
  }
  async function scrollThrough(selector) {
    const el = await waitFor(() => { const found = document.querySelector(selector); return visible(found) ? found : null; }, selector);
    const steps = 6;
    for (let i = 1; i <= steps; i++) {
      el.scrollTo({ top: ((el.scrollHeight - el.clientHeight) * i) / steps, behavior: skipping ? "auto" : "smooth" });
      await wait(PACE.scroll / steps);
    }
    await wait(PACE.scroll / 3);
  }

  // ---- The write window while paused. Pausing closes the director's write window, so nothing at all can change the
  // demonstration data while it stands still; Play reopens it before the director moves again. The window closes once
  // Studio has finished the change in hand - its autosave, a payment being recorded, or the saving that follows a tap
  // such as Confirm Build - shown by QUIET_MS without any change to the demo data, so no part-saved change is refused.
  // The quiet time is only counted once the director itself has stopped at a pause point (every wait checks for a
  // pause at least every 100 ms). If Studio is still busy after SETTLE_LIMIT_MS it closes anyway.
  const QUIET_MS = 800;
  let directorChannel = null;
  let suspended = false;
  let pauseToken = 0;
  function studioBusy() {
    try {
      const ui = window.KLABS_UI;
      const id = typeof ui?.readRecoveryDraft === "function" ? ui.readRecoveryDraft()?.quote?.id : "";
      if (id && typeof ui.hasUnsavedEdits === "function" && ui.hasUnsavedEdits(id)) return true;
      return typeof window.KLABS_BUILD_SYNC?.busy === "function" && window.KLABS_BUILD_SYNC.busy() === true;
    } catch (error) {
      return false;
    }
  }
  const writeCount = () => (typeof window.KLABS_DEMO?.writeCount === "function" ? window.KLABS_DEMO.writeCount() : 0);
  async function closeWindowWhenSettled(token) {
    let waited = 0;
    let quiet = 0;
    let last = writeCount();
    while (waited < SETTLE_LIMIT_MS) {
      const count = writeCount();
      if (count !== last || !parked || studioBusy()) quiet = 0;
      else quiet += 100;
      last = count;
      if (quiet >= QUIET_MS) break;
      await sleep(100);
      waited += 100;
      if (token !== pauseToken || !paused) return;
    }
    if (suspended) return;
    directorChannel.suspend();
    suspended = true;
  }

  // ---- The player: introduction, caption, Pause/Play (Replay once finished), Replay and chapters.
  let chapterIndex = -1;
  let playerState = "ready";
  function setCaption(text) {
    const caption = byId("demoCaption");
    if (caption) caption.textContent = text;
  }
  function setMessage(text) {
    const message = byId("demoModeMessage");
    if (message) message.textContent = text;
  }
  function showChapter(index) {
    chapterIndex = index;
    const label = byId("demoChapterLabel");
    if (label) label.textContent = index >= JOURNEY.length ? "Finished" : index >= 0 ? `${index + 1}/${JOURNEY.length} ${JOURNEY[index].title}` : "";
    document.querySelectorAll("[data-demo-chapter]").forEach((button) => {
      const n = Number(button.getAttribute("data-demo-chapter")) - 1;
      if (n === index) button.setAttribute("aria-current", "step"); else button.removeAttribute("aria-current");
      button.setAttribute("data-done", String(n < index));
      // Keep the chapter playing in view in the chapter row (it scrolls sideways on a phone); the page itself never moves.
      const list = button.closest("ol");
      if (n === index && list && list.scrollWidth > list.clientWidth) list.scrollLeft = Math.max(0, button.offsetLeft - list.offsetLeft - list.clientWidth / 2 + button.offsetWidth / 2);
    });
  }
  function setPlayButton(state) {
    playerState = state;
    const button = byId("demoPlayPauseBtn");
    if (!button) return;
    button.textContent = state === "paused" ? "Play" : state === "finished" ? "Replay" : "Pause";
    button.disabled = false;
    button.setAttribute("aria-pressed", String(state === "paused"));
    // Once finished, this button is the Replay button, so the separate one steps aside.
    const replay = byId("demoReplayBtn");
    if (replay) replay.hidden = state === "finished";
  }
  function togglePause() {
    if (chapterIndex < 0 || playerState === "finished") return;
    paused = !paused;
    setPlayButton(paused ? "paused" : "playing");
    pauseToken += 1;
    if (paused) {
      setCaption(`Paused. Press Play to carry on. ${captionNow}`.trim());
      closeWindowWhenSettled(pauseToken);
    } else {
      if (suspended) {
        directorChannel.resume();
        suspended = false;
      }
      parked = false;
      setCaption(captionNow);
      const waiting = resume;
      resume = [];
      waiting.forEach((go) => go());
    }
  }
  let captionNow = "";
  async function runStep(step) {
    const [kind, a, b] = step;
    if (kind === "caption") {
      captionNow = a;
      if (!skipping) setCaption(a);
      return wait(PACE.captionBase + a.length * PACE.captionPerChar);
    }
    if (kind === "tap") return tap(a);
    if (kind === "type") return type(a, b);
    if (kind === "open") {
      const trigger = await control(a);
      if (trigger.getAttribute("aria-expanded") !== "true") trigger.click();
      return wait(PACE.tap);
    }
    if (kind === "pick") return pick(a);
    if (kind === "until") return waitFor(() => visible(document.querySelector(a)), a);
    if (kind === "untilHidden") return waitFor(() => !visible(document.querySelector(a)), `${a} closing`);
    if (kind === "untilValue") return waitFor(() => document.querySelector(a)?.value === b, `${a} showing ${b}`);
    if (kind === "untilText") return waitFor(() => String(document.querySelector(a)?.textContent || "").includes(b), `${a} showing ${b}`);
    if (kind === "scroll") return scrollThrough(a);
    if (kind === "hold") return wait(a);
    throw new Error(`Unknown demonstration step: ${kind}`);
  }
  async function play(director, startAt) {
    await director.run(async () => {
      await wait(600);
      for (let i = 0; i < JOURNEY.length; i++) {
        skipping = i < startAt;
        showChapter(i);
        if (skipping) setCaption(`Skipping ahead to chapter ${startAt + 1}: ${JOURNEY[startAt].title}...`);
        for (const step of JOURNEY[i].steps) await runStep(step);
        skipping = false;
        await wait(PACE.chapter);
      }
      // Let Studio finish saving the last change before the write window closes.
      await sleep(1500);
    });
  }
  function restartAt(chapter) {
    window.location.replace(`${window.KLABS_DEMO.enterUrl()}&chapter=${chapter}`);
  }
  function requestedChapter() {
    const match = /(?:^|[?&])chapter=(\d{1,2})(?:&|$)/.exec(window.location.search || "");
    const n = match ? Number(match[1]) : 0;
    return n >= 1 && n <= JOURNEY.length ? n : 0;
  }
  function watchDockHeight(dock) {
    const root = document.documentElement;
    const apply = () => root.style.setProperty("--demo-dock-height", `${Math.ceil(dock.getBoundingClientRect().height)}px`);
    apply();
    if (typeof window.ResizeObserver === "function") new window.ResizeObserver(apply).observe(dock);
  }

  let opened = false;
  function open(director) {
    if (opened) throw new Error("The demonstration player is already open.");
    if (!director || typeof director.run !== "function" || typeof director.suspend !== "function" || typeof director.resume !== "function") {
      throw new Error("The demonstration director is unavailable.");
    }
    opened = true;
    directorChannel = director;
    const intro = byId("demoIntro");
    const start = byId("demoStartBtn");
    const exit = byId("demoIntroExitBtn");
    const playerPanel = byId("demoPlayer");
    const dock = byId("demoModeBar");
    const playPause = byId("demoPlayPauseBtn");
    const replay = byId("demoReplayBtn");
    const playerExit = byId("demoPlayerExitBtn");
    if (!intro || !start || !exit || !playerPanel || !dock || !playPause || !replay || !playerExit) throw new Error("The demonstration player is missing.");
    exit.addEventListener("click", () => window.KLABS_DEMO.exit());
    playerExit.addEventListener("click", () => window.KLABS_DEMO.exit());
    playPause.addEventListener("click", () => { if (playerState === "finished") restartAt(1); else togglePause(); });
    replay.addEventListener("click", () => restartAt(1));
    document.querySelectorAll("[data-demo-chapter]").forEach((button) => {
      button.addEventListener("click", () => restartAt(Number(button.getAttribute("data-demo-chapter"))));
    });
    watchDockHeight(dock);
    let started = false;
    const begin = async (chapter) => {
      if (started) return;
      started = true;
      start.disabled = true;
      intro.hidden = true;
      playerPanel.hidden = false;
      dock.setAttribute("data-player-open", "true");
      dock.setAttribute("data-playing", "true");
      setMessage(PLAYING);
      setPlayButton("playing");
      try {
        await play(director, chapter - 1);
        showChapter(JOURNEY.length);
        setCaption(FINISHED);
      } catch (error) {
        console.warn("[K-Labs Studio] The demonstration stopped:", error);
        setCaption(STOPPED);
      }
      setPlayButton("finished");
      dock.setAttribute("data-playing", "false");
      setMessage(RESTING);
    };
    start.addEventListener("click", () => begin(1));
    setMessage(RESTING);
    const chapter = requestedChapter();
    if (chapter) {
      // Replay or a chapter choice: the visitor asked for it, so it plays without the introduction.
      if (window.history && typeof window.history.replaceState === "function") window.history.replaceState(null, "", window.KLABS_DEMO.enterUrl());
      begin(chapter);
      return;
    }
    intro.hidden = false;
    try { start.focus({ preventScroll: true }); } catch (error) { /* focus is a convenience only */ }
  }

  window.KLABS_DEMO_PLAYER = Object.freeze({ open, journey: JOURNEY, pace: PACE });
})();
