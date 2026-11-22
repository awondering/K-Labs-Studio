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
 * 3 components, 4 live pricing (Rod Price and Your Return) and courier delivery, 5 the customer quote, 6 the customer accepts (Confirm
 * Build), 7 the deposit, 8 workshop progress, 9 the final payment and Mark Complete, 10 the final invoice and the
 * completed build summary. Payments and the invoice go through Studio's own screens to a local demo-only stand-in for
 * the payment service (js/public-entry.js); every document is shown with a DEMO watermark (css/studio.css).
 * Replay and the chapter controls reload the demonstration page (?demo&chapter=N), so every run starts from the same
 * fresh in-memory data without leaving Demo Mode; chapters before the chosen one are worked through quickly on the
 * same real screens.
 *
 * Pacing (Phase 3): one steady typing speed and one short beat between actions. Before every action its control is
 * brought fully into view, and the control is highlighted (data-demo-highlight, css/studio.css) while it is used, so
 * nothing changes off screen and every tap, entry and choice is obvious. Key moments get a short hold (1-2 s).
 *
 * Phase 3 review: a control is brought into view with the smallest scroll that shows it whole (so the page moves on in
 * reading order), and centred only if that is not enough. A watchdog stops the demonstration calmly - "Demonstration
 * paused. Press Replay to watch again." - if one step cannot finish within WATCHDOG_MS of playing time (paused time
 * does not count); the stuck step can do nothing afterwards. DEMO_BUILD is checked against the other demonstration
 * files before anything is shown (js/public-entry.js), so an older cached copy is never run with newer ones. */
(function () {
  "use strict";
  const DEMO_BUILD = "build148-v277";
  // Milliseconds. key: every typed character; beat: before and after every action, and between chapters; a caption is
  // read for captionBase + captionPerChar per character; scroll: reading down a document; view: the longest wait for a
  // control to come fully into view.
  const PACE = Object.freeze({ key: 60, beat: 540, captionBase: 800, captionPerChar: 22, scroll: 2400, view: 1500 });
  const STEP_TIMEOUT_MS = 10000;
  const WATCHDOG_MS = 20000;
  const SETTLE_LIMIT_MS = 5000;
  const RESTING = "Fictional data. Nothing here is saved, sent or synced.";
  const PLAYING = "Demonstration playing. Nothing here is saved, sent or synced.";
  const FINISHED = "That's the job, from enquiry to paid in full. Replay or pick a chapter.";
  const STOPPED = "Demonstration paused. Press Replay to watch again.";
  const PAUSED = "Paused. Press Play to carry on.";
  const skippingTo = (title, n) => `Skipping ahead to chapter ${n}: ${title}...`;

  const freeze = (value) => {
    if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  };
  const toggle = (bodyId) => `[aria-controls="${bodyId}"]`;
  // The journey. Steps: caption(text), tap(selector), type(selector, text), open(section toggle), pick([category,
  // subcategory, component]) from the component library, qty(component, quantity) on its line, name(build name) for the
  // new build, date(selector, daysAhead), show(selector or [selectors], ms) - brought into view and
  // highlighted for a moment -, until(selector visible), untilHidden(selector), untilValue(selector, value),
  // untilText(selector, text), scroll(selector) and hold(ms) on a key moment.
  const JOURNEY = freeze([
    { title: "Enquiry", steps: [
      ["caption", "New enquiry: Jordan Ellis wants a snapper spin rod."],
      ["tap", "#homeEnterRodBtn"],
      ["caption", "Jordan is new, so add their details."],
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
      ["caption", "Save the customer. Studio starts the build."],
      ["tap", "#customerFinderSubmitNewCustomerBtn"],
      ["untilHidden", "#customerFinderSheet"],
      ["until", "#workshopScreen.active"],
      ["untilValue", "#quoteCustomerName", "Jordan Ellis"],
      // The build starts with its real name; renaming stays in the build's ••• menu and is not demonstrated.
      ["name", "7' Snapper Spin"],
      ["untilText", "#quoteBuilderTitle", "7' Snapper Spin"],
    ] },
    { title: "Rod spec", steps: [
      ["caption", "Set the expected completion date and add a note."],
      ["open", toggle("workshopBuildSpecsBody")],
      ["date", "#quoteEstimatedCompletionDate", 21],
      ["type", "#quoteNotes", "Black wraps with gloss finish. Split grip."],
      ["caption", "Record the length, reel seat and grip sizes."],
      ["type", "#quoteSpecFinishedRodLength", "2134"],
      // Measurement first, then the point of the seat it is measured to, then straight on to the grips.
      ["type", "#quoteSpecReelSeatPosition", "330 mm"],
      ["tap", "#quoteSpecReelSeatRef [data-layout-seat-ref=\"rear\"]"],
      ["type", "#quoteSpecRearGripLength", "75 mm"],
      ["type", "#quoteSpecGripBelowReelSeatLength", "75 mm"],
      ["type", "#quoteSpecForeGripLength", "100 mm"],
    ] },
    { title: "Components", steps: [
      ["caption", "Pick the parts from your component library."],
      ["open", toggle("workshopComponentsBody")],
      ["pick", ["Blanks", "Spinning Blanks", "7'0\" Medium Spin 6-10 kg"]],
      ["caption", "Guides, reel seat and grip."],
      ["pick", ["Guides", "Spinning Guide Sets", "Medium Spin Guide Set"]],
      ["pick", ["Reel Seats", "Threaded Reel Seats", "DPS 18"]],
      // Two identical 75 mm grips: one line at Qty 2, costed at twice the unit price.
      ["caption", "Two 75 mm EVA grips: one line, Qty 2."],
      ["pick", ["Grips", "EVA Grips", "EVA Grip 75 mm"]],
      ["qty", "EVA Grip 75 mm", 2],
      ["caption", "Then the winding check and thread."],
      ["pick", ["Winding Checks", "Grip Winding Checks", "Aluminium Winding Check 16 mm"]],
      ["pick", ["Thread", "Nylon", "NCP Nylon Thread A Black"]],
    ] },
    { title: "Pricing", steps: [
      ["caption", "Studio adds up what the parts cost you."],
      ["open", toggle("workshopQuoteSummaryBody")],
      ["show", "#quoteCostBeforeMarginField", 1500],
      ["caption", "Set your rod price, GST included. Your return updates live."],
      ["type", "#quoteTotal", "899"],
      ["show", ["#quoteTotalField", "#quoteEarningsSummary"], 1500],
      // Advanced Pricing, in memory only: a target margin, then a target dollar return, each recalculating the Rod Price;
      // then back to the Rod Price and the simple view.
      ["caption", "Advanced: set a target margin. Studio works out the price."],
      ["tap", "[data-pricing-view=\"advanced\"]"],
      ["tap", "[data-pricing-method=\"percent\"]"],
      ["type", "#quoteMarginPercent", "55"],
      ["show", ["#quoteTotalField", "#quoteEarningsSummary"], 1000],
      ["caption", "Or the return you want in dollars. Or keep it simple."],
      ["tap", "[data-pricing-method=\"return\"]"],
      ["type", "#quoteProfit", "450"],
      ["show", ["#quoteTotalField", "#quoteEarningsSummary"], 1000],
      ["tap", "[data-pricing-method=\"price\"]"],
      ["type", "#quoteTotal", "899"],
      ["tap", "[data-pricing-view=\"simple\"]"],
      ["caption", "Jordan wants it couriered, not collected."],
      ["show", "#quoteFulfilmentGroup", 1200],
      ["tap", "[data-fulfilment-method=\"shipping\"]"],
      ["caption", "Add the freight and packaging."],
      ["type", "#quoteFreight", "18"],
      ["type", "#quotePackaging", "12"],
      ["show", "#quoteDeliveryTotalField", 1200],
      ["caption", "Delivery is charged on top. Your return stays the same."],
      ["show", ["#quoteCustomerTotalLine", "#quoteEarningsSummary"], 1800],
    ] },
    { title: "Quote", steps: [
      ["caption", "Open the quote, exactly as Jordan will see it."],
      ["tap", "#viewQuoteBtn"],
      ["until", "#viewQuoteSheet"],
      ["caption", "Parts, spec, delivery and price, under your name."],
      ["scroll", "#viewQuoteSheet .component-sheet__body"],
      ["hold", 1500],
      ["caption", "Marked DEMO here. In Studio it's ready to send."],
    ] },
    { title: "Accepted", steps: [
      ["caption", "Jordan says yes. Confirm the build."],
      ["tap", "#viewQuoteCloseBtn"],
      ["untilHidden", "#viewQuoteSheet"],
      ["tap", "#confirmBuildBtn"],
      ["until", "#confirmSheet"],
      ["tap", "#confirmSheet [data-confirm-action=\"confirm\"]"],
      ["untilHidden", "#confirmSheet"],
      ["untilText", "#workshopBuildLifecycleStatus", "Active"],
      ["caption", "Same job, same quote number. Now it's Active."],
    ] },
    { title: "Deposit", steps: [
      ["caption", "Jordan pays a $300 deposit. Record it."],
      ["tap", "#quoteRecordPaymentBtn"],
      ["until", "#quoteBalanceReceivedForm"],
      ["tap", "#quotePaymentTypeField [data-payment-type=\"deposit\"]"],
      ["type", "#quoteBalanceReceivedAmount", "300"],
      ["tap", "#quoteBalanceReceivedSave"],
      ["untilHidden", "#quoteBalanceReceivedForm"],
      ["caption", "Deposit recorded. The balance owing updates."],
    ] },
    { title: "Workshop", steps: [
      ["caption", "Into the workshop. The job waits in Active Jobs."],
      ["tap", "[data-nav=\"workshopScreen\"]"],
      ["tap", "[data-studio-action=\"open-builds\"]"],
      ["until", "#buildsScreen.active"],
      ["caption", "Open Jordan's job."],
      ["tap", "#buildsScreen [data-build-action=\"open\"]"],
      ["until", "#workshopScreen.active"],
      ["untilValue", "#quoteCustomerName", "Jordan Ellis"],
      ["caption", "Private workshop notes. Jordan never sees these."],
      ["open", toggle("workshopBuildSpecsBody")],
      ["type", "#quoteSpecBuilderNotes", "Blank spined. Guides wrapped and coated. Grip and reel seat fitted."],
    ] },
    { title: "Final payment", steps: [
      ["caption", "Rod finished. Jordan pays the balance."],
      ["open", toggle("workshopQuoteSummaryBody")],
      ["tap", "#quoteRecordPaymentBtn"],
      ["until", "#quoteBalanceReceivedForm"],
      ["caption", "Studio fills in what's still owing."],
      ["show", "#quoteBalanceReceivedAmount", 900],
      ["tap", "#quoteBalanceReceivedSave"],
      ["untilHidden", "#quoteBalanceReceivedForm"],
      ["caption", "Paid in full. Mark the build complete."],
      ["tap", "#toggleCurrentBuildStatusBtn"],
      ["untilText", "#workshopBuildLifecycleStatus", "Complete"],
    ] },
    { title: "Invoice", steps: [
      ["caption", "Issue the final invoice: both payments, nothing owing."],
      ["tap", "#viewInvoicePreviewBtn"],
      ["until", "#invoicePreviewSheet"],
      ["tap", "#invoicePreviewSheet [data-invoice-preview-action=\"issue\"]"],
      ["until", "#confirmSheet"],
      ["tap", "#confirmSheet [data-confirm-action=\"issue\"]"],
      ["untilText", "#invoicePreviewBody .invoice-document[data-invoice-issued=\"true\"]", "Invoice"],
      ["caption", "Marked DEMO here. In Studio it's ready to print or send."],
      ["hold", 1800],
      ["tap", "#invoicePreviewSheet .invoice-preview__actions [data-invoice-preview-action=\"close\"]"],
      ["untilHidden", "#invoicePreviewSheet"],
      ["caption", "And the completed build summary, for your records."],
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
  // halted: the watchdog has stopped the demonstration; a step still in hand stops at its next wait.
  let halted = false;
  const HALTED = "The demonstration was stopped.";
  const gate = () => (halted ? Promise.reject(new Error(HALTED)) : paused ? new Promise((resolve) => { parked = true; resume.push(resolve); }) : Promise.resolve());
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
  // ---- In view and highlighted. A control is fully in view when the whole of it is on screen below the dock, inside
  // every scrolling area that holds it, and nothing of Studio's (a bar, another sheet) lies over it - the visitor shield
  // and the dock aside.
  const HIGHLIGHT = "data-demo-highlight";
  function fullyInView(el) {
    const r = el.getBoundingClientRect();
    if (!(r.width > 0 || r.height > 0)) return false;
    const dock = byId("demoModeBar");
    const top = dock && !dock.hidden ? Math.max(0, dock.getBoundingClientRect().bottom) : 0;
    const inside = (box) => r.top >= box.top - 1 && r.bottom <= box.bottom + 1 && r.left >= box.left - 1 && r.right <= box.right + 1;
    if (!inside({ top, bottom: window.innerHeight || 0, left: 0, right: window.innerWidth || 0 })) return false;
    for (let parent = el.parentElement; parent && parent !== document.body && parent !== document.documentElement; parent = parent.parentElement) {
      const style = window.getComputedStyle(parent);
      if (/auto|scroll|hidden|clip/.test(`${style.overflowX} ${style.overflowY}`) && !inside(parent.getBoundingClientRect())) return false;
    }
    if (typeof document.elementsFromPoint !== "function") return true;
    // Phase 3 review change: points nearer the corners (was 15/85 % across, 25/75 % down), so a small floating
    // control over one corner (Back to top) counts as covering it.
    return [[0.5, 0.5], [0.1, 0.2], [0.9, 0.2], [0.1, 0.8], [0.9, 0.8]].every(([fx, fy]) => {
      const onTop = document.elementsFromPoint(r.left + r.width * fx, r.top + r.height * fy).find((node) => node.id !== "demoShield" && !node.closest("[data-demo-player]"));
      return !!onTop && el.contains(onTop);
    });
  }
  // Phase 3 review: first the smallest scroll that shows the control whole, just below the dock (css/studio.css sets the
  // page's scroll padding to the dock), so the page moves on in reading order; if that leaves it out of view, it is
  // centred. Each time it waits until the control is fully in view and has stopped moving (at most PACE.view; a control
  // taller than the screen is left as close as it comes).
  async function scrollUntilInView(el, block) {
    if (typeof el.scrollIntoView === "function") el.scrollIntoView({ block, inline: "nearest", behavior: skipping ? "auto" : "smooth" });
    let waited = 0;
    let last = "";
    let still = 0;
    for (;;) {
      await gate();
      const r = el.getBoundingClientRect();
      const now = `${Math.round(r.top)},${Math.round(r.left)}`;
      const inView = fullyInView(el);
      still = now === last ? still + 1 : 0;
      if (inView && still > 0) return true;
      // Stopped moving but not in view: this alignment is not enough.
      if (waited >= PACE.view || (still >= 4 && waited >= 250)) return inView;
      last = now;
      await sleep(50);
      waited += 50;
    }
  }
  // Studio's floating bottom bar covers the bottom of the screen; the page's bottom scroll padding (css/studio.css)
  // keeps clear of it, measured each time because it is not on every screen.
  function measureBottomBar() {
    const bar = document.querySelector(".bottom-nav");
    const top = bar && visible(bar) ? bar.getBoundingClientRect().top : Infinity;
    const clear = Number.isFinite(top) ? Math.max(0, Math.ceil((window.innerHeight || 0) - top)) : 0;
    document.documentElement.style.setProperty("--demo-bottom-clear", `${clear}px`);
  }
  async function bringIntoView(el) {
    if (fullyInView(el)) return;
    measureBottomBar();
    if (await scrollUntilInView(el, "nearest")) return;
    await scrollUntilInView(el, "center");
  }
  const highlight = (els, on) => els.forEach((el) => { if (on) el.setAttribute(HIGHLIGHT, ""); else el.removeAttribute(HIGHLIGHT); });
  const shown = (selector) => waitFor(() => { const found = document.querySelector(selector); return visible(found) ? found : null; }, selector);
  // The control for the next action: on screen, in view, highlighted, then a beat so the visitor sees it first.
  async function control(selector) {
    const el = await shown(selector);
    await bringIntoView(el);
    highlight([el], true);
    await wait(PACE.beat);
    // Phase 3 review: something of Studio's can float over it once scrolling stops (the Back to top button): then it is
    // centred, clear of the screen's edges, before it is used.
    if (!fullyInView(el)) {
      await scrollUntilInView(el, "center");
      await wait(PACE.beat);
    }
    return el;
  }
  async function tap(selector) {
    const el = await control(selector);
    if (el.disabled) throw new Error(`${selector} is not available.`);
    el.click();
    await wait(PACE.beat);
    highlight([el], false);
  }
  // A key moment: what to look at is brought into view and highlighted for a moment.
  async function show(selectors, ms) {
    const els = [];
    for (const selector of [].concat(selectors)) els.push(await shown(selector));
    for (const el of els) await bringIntoView(el);
    highlight(els, true);
    await wait(ms);
    highlight(els, false);
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
    await wait(PACE.beat);
    highlight([el], false);
  }
  async function setDate(selector, daysAhead) {
    const el = await control(selector);
    if (el.type !== "date") throw new Error(`${selector} is not a date field.`);
    const date = new Date();
    date.setDate(date.getDate() + daysAhead);
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const value = `${date.getFullYear()}-${mm}-${dd}`;
    // Native date controls accept complete date values only.
    el.value = value;
    if (el.value !== value) throw new Error(`${selector} did not accept ${value}.`);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    await wait(PACE.beat);
    highlight([el], false);
  }
  async function pick(path) {
    await tap("#addComponentBtn");
    for (const name of path) await tap(`#choicePickerList [data-choice-option=${cssString(name)}]`);
    await waitFor(() => !visible(byId("choicePickerSheet")), "the component library closing");
  }
  // Sets a component line's quantity by typing it into the line's own Quantity field (the library adds one; there is
  // no quantity before adding). The +/- steppers stay blocked in Demo Mode (js/supabase-client.js), so they are not
  // used. Then the quantity is shown and the row closed again.
  async function setQuantity(name, qty) {
    const open = `#quoteComponentsList [data-component-action="open-row"][aria-label$=${cssString(` for ${name}`)} i]`; // Studio title-cases the line label ("75 Mm")
    const trigger = await shown(open);
    const index = trigger.getAttribute("data-component-index");
    if (trigger.getAttribute("aria-expanded") !== "true") await tap(open);
    const field = `#quoteComponentsList [data-component-key="quantity"][data-component-index="${index}"]`;
    await type(field, String(qty));
    if (Number(document.querySelector(field)?.value || 0) !== qty) throw new Error(`${name} did not reach Qty ${qty}.`);
    await show(field, 1200);
    const close = `#quoteComponentsList [data-component-action="open-row"][data-component-index="${index}"][aria-expanded="true"]`;
    if (document.querySelector(close)) await tap(close);
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
    if (paused) pauses += 1;
    setPlayButton(paused ? "paused" : "playing");
    pauseToken += 1;
    if (paused) {
      setCaption(PAUSED);
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
    if (kind === "date") return setDate(a, b);
    if (kind === "open") {
      const trigger = await shown(a);
      if (trigger.getAttribute("aria-expanded") === "true") return undefined;
      return tap(a);
    }
    if (kind === "pick") return pick(a);
    if (kind === "qty") return setQuantity(a, b);
    if (kind === "name") {
      const named = window.KLABS_UI?.nameCurrentBuild?.(a);
      if (named === false) throw new Error(`The build could not be named ${a}.`);
      return named;
    }
    if (kind === "show") return show(a, b);
    if (kind === "until") return waitFor(() => visible(document.querySelector(a)), a);
    if (kind === "untilHidden") return waitFor(() => !visible(document.querySelector(a)), `${a} closing`);
    if (kind === "untilValue") return waitFor(() => document.querySelector(a)?.value === b, `${a} showing ${b}`);
    if (kind === "untilText") return waitFor(() => String(document.querySelector(a)?.textContent || "").includes(b), `${a} showing ${b}`);
    if (kind === "scroll") return scrollThrough(a);
    if (kind === "hold") return wait(a);
    throw new Error(`Unknown demonstration step: ${kind}`);
  }
  // Phase 3 review: the watchdog. A step that has not finished after WATCHDOG_MS of playing time stops the
  // demonstration (a pause starts the count again, so paused time never counts). The stuck step is halted (when the
  // demonstration stops, below): its next wait refuses to go on, and the write window has closed by then.
  let pauses = 0;
  function watched(step) {
    const running = runStep(step);
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (fn, value) => { if (!done) { done = true; fn(value); } };
      const armWatchdog = (seenPauses) => window.setTimeout(() => {
        if (done) return;
        if (paused || pauses !== seenPauses) { armWatchdog(pauses); return; }
        finish(reject, new Error(`A demonstration step did not finish in time: ${step[0]} ${JSON.stringify(step[1])}`));
      }, WATCHDOG_MS);
      armWatchdog(pauses);
      running.then((value) => finish(resolve, value), (error) => finish(reject, error));
    });
  }
  async function play(director, startAt) {
    await director.run(async () => {
      await wait(PACE.beat);
      for (let i = 0; i < JOURNEY.length; i++) {
        skipping = i < startAt;
        showChapter(i);
        if (skipping) setCaption(skippingTo(JOURNEY[startAt].title, startAt + 1));
        for (const step of JOURNEY[i].steps) await watched(step);
        skipping = false;
        await wait(PACE.beat);
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
        halted = true;
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

  // messages: everything else the caption line can show (the browser test checks none of it is cut off either).
  const MESSAGES = Object.freeze([PAUSED, FINISHED, STOPPED, ...JOURNEY.map((chapter, i) => skippingTo(chapter.title, i + 1))]);
  window.KLABS_DEMO_PLAYER = Object.freeze({ open, build: DEMO_BUILD, journey: JOURNEY, pace: PACE, watchdog: WATCHDOG_MS, messages: MESSAGES });
})();
