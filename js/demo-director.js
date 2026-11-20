/* Q18 Demo Mode: the demonstration player and its director. Loaded only on a Demo Mode page, after Studio's interface.
 *
 * The director works the real Studio screens the way a person would - it taps real buttons and types into real fields,
 * one character at a time - so Studio's own handlers, checks and saving run exactly as in normal use. It never writes
 * data or changes screens directly. Every change happens inside a director step (KLABS_DEMO.claimDirector in
 * js/demo-mode.js); outside a step the demo Store refuses all writes, and the visitor shield turns away the visitor's
 * own taps and typing, so the visitor watches and only the introduction and Exit demo respond.
 *
 * Phase 1 amendment: the introduction screen and a first proof - from Start, the director creates the customer
 * Jordan Ellis and opens an empty New Rod Build for them through the real New Rod Build and Add Customer screens,
 * then stops. Play/Pause/Replay, chapters, captions and the rest of the journey are Phase 2A. */
(function () {
  "use strict";
  const KEY_MS = 55;
  const FIELD_PAUSE_MS = 320;
  const TAP_SETTLE_MS = 420;
  const STEP_TIMEOUT_MS = 8000;
  const RESTING = "Fictional data. Nothing here is saved, sent or synced.";
  const RUNNING = "Demonstration running. Watch Studio work - nothing here is saved, sent or synced.";
  const FINISHED = "Preview ends here: customer Jordan Ellis created and a new rod build opened. The full walkthrough is in development.";
  const STOPPED = "The demonstration stopped unexpectedly. Exit demo and try again.";

  const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
  const byId = (id) => document.getElementById(id);
  const visible = (el) => !!el && el.isConnected && !el.closest("[hidden]") && el.getClientRects().length > 0;

  async function waitFor(check, label) {
    const deadline = Date.now() + STEP_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const result = check();
      if (result) return result;
      await wait(50);
    }
    throw new Error(`The demonstration could not find ${label}.`);
  }
  async function control(id) {
    const el = await waitFor(() => (visible(byId(id)) ? byId(id) : null), `#${id}`);
    if (typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "center", behavior: "smooth" });
    await wait(TAP_SETTLE_MS);
    return el;
  }
  async function tap(id) {
    const el = await control(id);
    if (el.disabled) throw new Error(`#${id} is not available.`);
    el.click();
    await wait(TAP_SETTLE_MS);
  }
  async function type(id, text) {
    const el = await control(id);
    el.value = "";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    for (const character of String(text)) {
      el.value += character;
      el.dispatchEvent(new InputEvent("input", { bubbles: true, data: character, inputType: "insertText" }));
      await wait(KEY_MS);
    }
    el.dispatchEvent(new Event("change", { bubbles: true }));
    await wait(FIELD_PAUSE_MS);
  }
  const activeScreen = () => document.querySelector(".screen.active")?.id || "";

  // The proof: a new enquiry from Jordan Ellis becomes a customer and an empty New Rod Build, on Studio's own screens.
  async function playProof(director) {
    await director.run(async () => {
      await wait(600);
      await tap('homeEnterRodBtn');
      await tap('customerFinderAddNewAction');
      await type('customerFinderNewCustomerName', 'Jordan Ellis');
      await type('customerFinderNewPhone', '021 555 0142');
      await type('customerFinderNewEmail', 'jordan.ellis@example.com');
      await type('customerFinderNewAddress1', '8 Dune Street');
      await type('customerFinderNewSuburb', 'Mount Maunganui');
      await type('customerFinderNewCity', 'Tauranga');
      await type('customerFinderNewRegion', 'Bay of Plenty');
      await type('customerFinderNewPostcode', '3116');
      await type('customerFinderNewCountry', 'New Zealand');
      await tap('customerFinderSubmitNewCustomerBtn');
      await waitFor(() => activeScreen() === 'workshopScreen' && byId('quoteCustomerName')?.value === 'Jordan Ellis', "the new rod build for Jordan Ellis");
      // Let Studio finish saving the new build before the write window closes.
      await wait(1500);
    });
  }

  function setMessage(text) {
    const message = byId("demoModeMessage");
    if (message) message.textContent = text;
  }

  let opened = false;
  function open(director) {
    if (opened) throw new Error("The demonstration player is already open.");
    if (!director || typeof director.run !== "function") throw new Error("The demonstration director is unavailable.");
    opened = true;
    const intro = byId("demoIntro");
    const start = byId("demoStartBtn");
    const exit = byId("demoIntroExitBtn");
    if (!intro || !start || !exit) throw new Error("The demonstration introduction is missing.");
    exit.addEventListener("click", () => window.KLABS_DEMO.exit());
    start.addEventListener("click", async () => {
      if (start.disabled) return;
      start.disabled = true;
      intro.hidden = true;
      setMessage(RUNNING);
      try {
        await playProof(director);
        setMessage(FINISHED);
      } catch (error) {
        console.warn("[K-Labs Studio] The demonstration stopped:", error);
        setMessage(STOPPED);
      }
    });
    setMessage(RESTING);
    intro.hidden = false;
    try { start.focus({ preventScroll: true }); } catch (error) { /* focus is a convenience only */ }
  }

  window.KLABS_DEMO_PLAYER = Object.freeze({ open });
})();
