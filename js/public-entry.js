(function () {
  const privateScripts = [
    "js/config.js", "js/storage.js", "js/guide-layout.js", "js/thread-wrap.js",
    "js/guide-train.js", "js/thread-studio-host.js", "js/kr-guide-layout-host.js", "js/studio-visuals.js", "js/navigation.js", "js/business-logo.js", "js/invoice-pdf.js", "js/ui.js",
    "js/component-sync.js", "js/build-sync-journal.js", "js/guarded-build-transport.js", "js/build-sync.js", "js/build-sync-diff.js", "js/build-sync-review.js", "js/settings-sync.js", "js/studio-recovery-export.js",
    "js/quote-number-allocator.js", "js/app.js"
  ];
  const adminScript = "js/admin-panel.js";
  // Q18 Demo Mode runs the real interface without an account. Sync, owner administration, the quote-number allocator
  // and the recovery export are never loaded there, and js/storage.js is replaced by the in-memory store from
  // js/demo-mode.js. The demonstration data is loaded first; the demonstration player (js/demo-director.js) after
  // Studio's interface and before app.js.
  const demoExcludedScripts = new Set([
    "js/storage.js", "js/component-sync.js", "js/build-sync-journal.js", "js/guarded-build-transport.js", "js/build-sync.js",
    "js/build-sync-diff.js", "js/build-sync-review.js", "js/settings-sync.js", "js/studio-recovery-export.js", "js/quote-number-allocator.js"
  ]);
  const demoScripts = ["js/demo-data.js", ...privateScripts.filter((src) => !demoExcludedScripts.has(src))];
  demoScripts.splice(demoScripts.indexOf("js/app.js"), 0, "js/demo-director.js");
  const DEMO_UNAVAILABLE_HASH = "#demo-unavailable";
  // Q18 Phase 3 review: every demonstration file (the page, js/demo-mode.js, this file, js/demo-data.js and
  // js/demo-director.js) carries this build. If any of them is an older cached copy, nothing is shown: the page asks
  // the service worker for the new version and reloads once (?demo&fresh=1); still mixed after that, the visitor goes
  // back to the public entry with the usual notice.
  const DEMO_BUILD = "build148-v290";
  const DEMO_FRESH_PARAM = "fresh";
  // An unreachable server (weak signal, Wi-Fi without internet) must not hold the launch screen for the platform's
  // own long network timeout; after this the cached entitlement is used, exactly as when offline. 3 s is more than ten
  // times the measured round trip on a weak mobile connection (Q16: an unanswered launch waited 8.2 s, now 3.2 s).
  const ENTITLEMENT_TIMEOUT_MS = 3000;
  // Visitors who are not signed in never reach any of this. These are the same static files the server already
  // publishes; fetching them early changes when they download, not who may run them.
  let preloadStarted = false;
  let loadPromise = null;
  let pendingDestination = "";
  let currentSession = null;
  let currentEntitlement = null;
  let trialExpiryTimer = null;
  let blockedCheckInFlight = false;
  let renewalCheckInFlight = false;

  function setVisible(id, visible) {
    const element = document.getElementById(id);
    if (element) element.hidden = !visible;
  }

  function entitlementCanWrite() {
    if (currentSession?.user?.id && !window.KLABS_BUILD_TAB_LOCK?.owns(currentSession.user.id)) return false;
    const access = window.KLABS_ACCESS_STATE;
    if (!access) return true;
    if (access.offline_session) return false;
    if (access.can_write !== true) return false;
    const deadline = Number(access.local_expires_at);
    if (Number.isFinite(deadline) && deadline > 0 && Date.now() >= deadline) {
      access.can_write = false;
      access.access_state = "expired";
      access.trial_available = false;
      return false;
    }
    return true;
  }
  window.KLABS_CAN_WRITE = entitlementCanWrite;

  // True when this browser holds a stored Supabase session. Used only as a hint to start downloading (never running)
  // the private application early; whether Studio opens is still decided by the verified session and entitlement.
  function hasStoredSession() {
    try {
      const storage = window.localStorage;
      if (!storage || typeof storage.key !== "function") return false;
      for (let index = 0; index < storage.length; index += 1) {
        if (/^sb-.+-auth-token$/.test(storage.key(index) || "")) return true;
      }
    } catch (error) {
      return false;
    }
    return false;
  }

  // Download the private application in parallel while the account is still being verified. The scripts are only
  // fetched here (rel=preload does not execute them); loadPrivateApp still runs them one by one, in order, only
  // after the entitlement check passes.
  function preloadPrivateApp() {
    if (preloadStarted || !document.head || typeof document.createElement !== "function") return;
    preloadStarted = true;
    [...privateScripts, adminScript].forEach((src) => {
      const link = document.createElement("link");
      link.rel = "preload";
      link.as = "script";
      link.href = src;
      document.head.appendChild(link);
    });
  }

  function showHome() {
    if (trialExpiryTimer) window.clearTimeout(trialExpiryTimer);
    trialExpiryTimer = null;
    currentSession = null;
    currentEntitlement = null;
    window.KLABS_ACCESS_STATE = null;
    document.body.classList.remove("klabs-offline-session");
    document.getElementById("authScreen").style.display = "none";
    setVisible("accountAccessScreen", false);
    setVisible("exploreDemoScreen", false);
    document.getElementById("app").style.display = "";
    document.body.classList.add("klabs-logged-out");
    document.body.classList.remove("klabs-auth-resolving", "klabs-auth-open", "klabs-entry-choice", "klabs-explore-demo", "klabs-read-only");
    try {
      if (window.sessionStorage.getItem("klabs-account-blocked") === "true") {
        window.sessionStorage.removeItem("klabs-account-blocked");
        showAuth("");
        document.getElementById("authMessage").textContent = "This account has been blocked. Contact K-Labs Studio for assistance.";
      }
    } catch (error) {
      console.warn("[K-Labs Studio] Could not restore the blocked-account notice:", error);
    }
  }

  function showAuth(destination) {
    pendingDestination = destination || "";
    document.getElementById("authForm").hidden = false;
    document.getElementById("authShowSignUp").hidden = false;
    document.getElementById("authSignUpForm").hidden = true;
    document.getElementById("app").style.display = "none";
    setVisible("accountAccessScreen", false);
    setVisible("exploreDemoScreen", false);
    document.getElementById("authScreen").style.display = "flex";
    document.body.classList.add("klabs-auth-open");
    document.body.classList.remove("klabs-entry-choice", "klabs-explore-demo");
    document.getElementById("authEmail").focus();
    window.scrollTo(0, 0);
  }

  function showAccessChoice(entitlement) {
    currentEntitlement = entitlement;
    document.getElementById("authScreen").style.display = "none";
    document.getElementById("app").style.display = "none";
    setVisible("exploreDemoScreen", false);
    setVisible("accountAccessScreen", true);
    document.body.classList.remove("klabs-auth-resolving", "klabs-auth-open", "klabs-logged-out", "klabs-explore-demo", "klabs-read-only");
    document.body.classList.add("klabs-entry-choice");
    const message = document.getElementById("accountAccessMessage");
    const verified = entitlement.email_verified === true;
    message.textContent = verified
      ? "Your account is ready. Start the optional seven-day trial when you are ready, or look around using fictional demonstration data."
      : "Verify your email before starting a trial or entering Explore Mode. Use the link sent to your inbox, then return here.";
    setVisible("accountAccessChoices", verified);
    setVisible("verifyEmailContinueBtn", !verified);
    document.getElementById("accountAccessError").textContent = "";
  }

  function showExploreDemo() {
    if (!currentSession || !currentEntitlement?.email_verified) {
      document.getElementById("accountAccessError").textContent = "Verify your email before entering Explore Mode.";
      return;
    }
    document.getElementById("authScreen").style.display = "none";
    document.getElementById("app").style.display = "none";
    setVisible("accountAccessScreen", false);
    setVisible("exploreDemoScreen", true);
    document.body.classList.remove("klabs-auth-resolving", "klabs-auth-open", "klabs-logged-out", "klabs-entry-choice", "klabs-read-only");
    document.body.classList.add("klabs-explore-demo");
    window.scrollTo(0, 0);
  }

  async function signOutFromEntry(messageId) {
    const message = document.getElementById(messageId);
    const { error } = await window.KLABS_SUPABASE_CLIENT.auth.signOut();
    if (error) {
      message.textContent = `Could not sign out. ${error.message || "Please try again."}`;
      return;
    }
    window.KLABS_ACCESS_STATE = null;
    window.location.reload();
  }

  // supabase-js reports a failed fetch as { message: "TypeError: Failed to fetch" | "TypeError: Load failed", status: 0 }
  // with no error.name, and iOS can report navigator.onLine === true while the network is unusable. Treat all of
  // those, and our own timeout, as "cannot reach the server" so a cached entitlement can open Studio.
  function isNetworkFailure(error, status) {
    if (window.navigator?.onLine === false) return true;
    // The server answered with an HTTP status: that is a real refusal or fault, never "offline".
    if (typeof status === "number" && status >= 100) return false;
    return status === 0
      || error?.name === "TypeError"
      || error?.name === "AbortError"
      || /network|fetch failed|failed to fetch|load failed|offline|abort|timed? ?out/i.test(error?.message || "");
  }

  async function requestEntitlement() {
    let call = window.KLABS_SUPABASE_CLIENT.rpc("get_account_entitlement");
    let timer = null;
    if (typeof AbortController === "function" && typeof call?.abortSignal === "function") {
      const controller = new AbortController();
      call = call.abortSignal(controller.signal);
      timer = window.setTimeout(() => controller.abort(), ENTITLEMENT_TIMEOUT_MS);
    }
    try {
      return await call;
    } finally {
      if (timer !== null) window.clearTimeout(timer);
    }
  }

  // The access record this device saved the last time the server answered for this account, with its expiry applied
  // as of now. null when there is none for exactly this account.
  function cachedEntitlementFor(userId) {
    const key = `klabs-account-entitlement:${userId || ""}`;
    let cached;
    try {
      cached = JSON.parse(window.localStorage.getItem(key) || "null");
    } catch {
      cached = null;
    }
    if (!cached || !userId || cached.user_id !== userId || !cached.entitlement || !cached.saved_at) return null;
    const elapsed = Math.max(0, Date.now() - Date.parse(cached.saved_at));
    const access = { ...cached.entitlement, offline: true };
    const cachedServerTime = Date.parse(access.server_time);
    if (!Number.isFinite(cachedServerTime) || !Number.isFinite(elapsed)) {
      throw new Error("Your saved account access is invalid. Connect to the internet and try again.");
    }
    access.server_time = new Date(cachedServerTime + elapsed).toISOString();
    const expiry = access.access_state === "trial" ? access.trial_expires_at : access.access_expires_at;
    if (expiry && Date.parse(expiry) <= Date.parse(access.server_time)) {
      access.access_state = "expired";
      access.can_write = false;
      access.trial_available = false;
    }
    return access;
  }

  async function refreshEntitlement() {
    const { data, error, status } = await requestEntitlement();
    if (error) {
      if (!isNetworkFailure(error, status)) throw error;
      const access = cachedEntitlementFor(currentSession?.user?.id || "");
      if (!access) {
        return {
          access_state: "offline_readonly",
          can_write: false,
          trial_available: false,
          email_verified: false,
          offline: true,
          server_time: new Date().toISOString()
        };
      }
      return access;
    }
    if (!data || typeof data !== "object" || typeof data.access_state !== "string") {
      throw new Error("The account access service returned an invalid response.");
    }
    try {
      window.localStorage.setItem(`klabs-account-entitlement:${currentSession?.user?.id || ""}`, JSON.stringify({
        user_id: currentSession?.user?.id || "",
        saved_at: new Date().toISOString(),
        entitlement: data
      }));
    } catch (storageError) {
      console.warn("[K-Labs Studio] Could not cache account access for offline startup:", storageError);
    }
    return data;
  }

  async function handleBlockedAccount() {
    if (trialExpiryTimer) window.clearTimeout(trialExpiryTimer);
    trialExpiryTimer = null;
    window.KLABS_ACCESS_STATE = null;
    try {
      window.sessionStorage.setItem("klabs-account-blocked", "true");
    } catch (error) {
      console.warn("[K-Labs Studio] Could not persist the blocked-account notice:", error);
    }
    try {
      const { error } = await window.KLABS_SUPABASE_CLIENT.auth.signOut({ scope: "local" });
      if (error) console.error("[K-Labs Studio] Blocked account local sign-out failed:", error);
    } catch (error) {
      console.error("[K-Labs Studio] Blocked account local sign-out failed:", error);
    }
    currentSession = null;
    currentEntitlement = null;
    showAuth("");
    document.getElementById("authMessage").textContent = "This account has been blocked. Contact K-Labs Studio for assistance.";
  }

  // Q17: while the saved records are open view-only, retry the sign-in renewal (an auth request only, no data
  // request). Restart normally once it succeeds or is refused; keep waiting while the server cannot be reached.
  function reloadAfterRenewal(result, nothingOpened = false) {
    // Nothing could be opened offline: only a successful renewal is worth a restart.
    if (nothingOpened) {
      if (result?.data?.session?.user?.id && !window.KLABS_ACCESS_STATE) window.location.reload();
      return;
    }
    if (!window.KLABS_ACCESS_STATE?.offline_session) return;
    const networkFailure = typeof window.KLABS_IS_RENEWAL_NETWORK_FAILURE === "function"
      && window.KLABS_IS_RENEWAL_NETWORK_FAILURE(result?.error);
    if (result?.data?.session?.user?.id || !networkFailure) window.location.reload();
  }
  function watchRenewal(request, nothingOpened = false) {
    Promise.resolve(request).then((result) => reloadAfterRenewal(result, nothingOpened), () => {});
  }
  async function retryOfflineRenewal() {
    if (renewalCheckInFlight || window.navigator?.onLine === false) return;
    renewalCheckInFlight = true;
    try {
      reloadAfterRenewal(await window.KLABS_SUPABASE_CLIENT.auth.getSession());
    } catch (error) {
      console.warn("[K-Labs Studio] Could not renew the sign-in:", error);
    } finally {
      renewalCheckInFlight = false;
    }
  }

  async function verifyCurrentAccountBlock() {
    if (window.KLABS_ACCESS_STATE?.offline_session) {
      await retryOfflineRenewal();
      return;
    }
    if (!currentSession?.user?.id || blockedCheckInFlight || window.navigator?.onLine === false) return;
    blockedCheckInFlight = true;
    try {
      const { data, error } = await window.KLABS_SUPABASE_CLIENT.rpc("klabs_account_is_blocked");
      if (error) throw error;
      if (data === true) await handleBlockedAccount();
    } catch (error) {
      console.warn("[K-Labs Studio] Could not refresh account block status:", error);
    } finally {
      blockedCheckInFlight = false;
    }
  }

  function scheduleEntitlementExpiry(entitlement) {
    if (trialExpiryTimer) window.clearTimeout(trialExpiryTimer);
    trialExpiryTimer = null;
    const expiresAt = entitlement.access_state === "trial"
      ? entitlement.trial_expires_at
      : entitlement.access_expires_at;
    if (entitlement.can_write !== true || !expiresAt || !entitlement.server_time) return;
    const remaining = Date.parse(expiresAt) - Date.parse(entitlement.server_time);
    if (!Number.isFinite(remaining)) throw new Error("The entitlement expiry time is invalid.");
    if (remaining <= 0) {
      window.KLABS_ACCESS_STATE.can_write = false;
      window.KLABS_ACCESS_STATE.access_state = "expired";
      return;
    }
    window.KLABS_ACCESS_STATE.local_expires_at = Date.now() + remaining;
    trialExpiryTimer = window.setTimeout(() => {
      if (!window.KLABS_ACCESS_STATE) return;
      window.KLABS_ACCESS_STATE = {
        ...window.KLABS_ACCESS_STATE,
        access_state: "expired",
        can_write: false,
        trial_available: false
      };
      if (currentSession && window.KLABS_APPLY_AUTH_STATE) {
        window.KLABS_APPLY_AUTH_STATE(currentSession);
      }
    }, remaining);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Could not load ${src}. Reload and try again.`));
      document.head.appendChild(script);
    });
  }

  function loadPrivateApp() {
    if (!loadPromise) {
      const adminPanelPromise = loadScript(adminScript);
      const privateAppPromise = privateScripts.reduce(
        (previous, src) => previous.then(() => loadScript(src)),
        Promise.resolve()
      );
      loadPromise = Promise.all([privateAppPromise, adminPanelPromise]);
    }
    return loadPromise;
  }

  async function applySession(session, applyAuthState) {
    if (!session?.user?.id) {
      window.KLABS_BUILD_TAB_LOCK?.release();
      showHome();
      return;
    }
    currentSession = session;
    document.body.classList.add("klabs-auth-resolving");
    preloadPrivateApp();
    try {
      const entitlement = await refreshEntitlement();
      const { data: sessionData, error: sessionError } = await window.KLABS_SUPABASE_CLIENT.auth.getSession();
      if (sessionError) throw sessionError;
      if (sessionData?.session?.user?.id !== session.user.id) {
        window.location.reload();
        return;
      }
      currentSession = sessionData.session;
      currentEntitlement = entitlement;
      const allowedStates = ["trial_eligible", "trial", "expired", "grandfathered", "complimentary", "paid", "offline_readonly"];
      if (!allowedStates.includes(entitlement.access_state)
        || typeof entitlement.can_write !== "boolean"
        || typeof entitlement.email_verified !== "boolean"
        || (entitlement.access_state === "trial" && (!entitlement.trial_expires_at || !entitlement.server_time))
        || (entitlement.access_expires_at && !entitlement.server_time)) {
        throw new Error("The account access service returned an unsupported entitlement.");
      }
      if (entitlement.access_state === "trial_eligible") {
        window.KLABS_BUILD_TAB_LOCK?.release();
        showAccessChoice(entitlement);
        return;
      }
      await window.KLABS_BUILD_TAB_LOCK.acquire(session.user.id);
      window.KLABS_ACCESS_STATE = entitlement;
      scheduleEntitlementExpiry(entitlement);
      setVisible("accountAccessScreen", false);
      setVisible("exploreDemoScreen", false);
      document.body.classList.remove("klabs-entry-choice", "klabs-explore-demo");
      await loadPrivateApp();
      const { data: latestData, error: latestError } = await window.KLABS_SUPABASE_CLIENT.auth.getSession();
      if (latestError) throw latestError;
      if (latestData?.session?.user?.id !== session.user.id) {
        window.KLABS_BUILD_TAB_LOCK.release();
        window.location.reload();
        return;
      }
      applyAuthState(latestData.session);
    } catch (error) {
      window.KLABS_BUILD_TAB_LOCK?.release();
      if (window.KLABS_SUPABASE_CLIENT && window.navigator?.onLine !== false) {
        try {
          const { data: blocked, error: blockError } = await window.KLABS_SUPABASE_CLIENT.rpc("klabs_account_is_blocked");
          if (!blockError && blocked === true) {
            await handleBlockedAccount();
            return;
          }
        } catch (blockCheckError) {
          console.warn("[K-Labs Studio] Could not check account block status after access verification failed:", blockCheckError);
        }
      }
      document.body.classList.remove("klabs-auth-resolving");
      document.getElementById("app").style.display = "none";
      document.getElementById("authScreen").style.display = "flex";
      document.body.classList.add("klabs-auth-open");
      throw error;
    }
    document.body.classList.remove("klabs-auth-open");
    const destination = pendingDestination;
    pendingDestination = "";
    if (destination === "new-build") window.KLABS_UI.startNewBuildFlow();
    else if (destination) {
      const nav = document.querySelector(`[data-nav="${destination}"]`);
      if (nav) nav.click();
    }
  }

  // Q18 2B: local stand-in for Studio's payment service (js/build-sync.js is not loaded in Demo Mode). Studio's own Record
  // Payment and Issue Invoice screens hand it the deposit, the final payment and the final invoice exactly as they
  // would hand them to the server; it applies the same rules as the server (one deposit, no duplicates, valid amounts
  // and dates, never more than the saved price, one invoice that matches the saved build) and keeps the result with the
  // saved build in the demonstration's in-memory Store, through Studio's own saveBuildRecords - so, like everything
  // else, only while the demonstration director is running. Nothing is sent anywhere or kept on the device.
  function demoFinancialService() {
    let inFlight = false;
    const clone = (value) => JSON.parse(JSON.stringify(value));
    const canonical = (value) => {
      if (Array.isArray(value)) return value.map(canonical);
      if (value && typeof value === "object") return Object.keys(value).sort().reduce((out, key) => { out[key] = canonical(value[key]); return out; }, {});
      return value;
    };
    const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
    const validDate = (text) => /^\d{4}-\d{2}-\d{2}$/.test(String(text || "")) && !Number.isNaN(Date.parse(`${text}T00:00:00Z`))
      && new Date(`${text}T00:00:00Z`).toISOString().slice(0, 10) === text;
    const cents = (value) => Math.round(Number(value) * 100);
    function nextPayments(record, data) {
      const payments = Array.isArray(record.payments) ? clone(record.payments) : [];
      const amountText = String(data && data.amount);
      if (!data || !String(data.id || "") || !validDate(data.date) || !/^[0-9]+(\.[0-9]{1,2})?$/.test(amountText)
        || !(Number(amountText) > 0) || !["deposit", "balance"].includes(data.type)) {
        throw new Error("Enter a valid payment amount and date.");
      }
      const payment = { id: String(data.id), type: data.type, amount: Number(amountText), date: data.date };
      if (payments.some((item) => item.id === payment.id
        || (item.type === payment.type && item.date === payment.date && cents(item.amount) === cents(payment.amount)))) {
        throw new Error("This payment is already recorded; review payment history.");
      }
      if (payment.type === "deposit" && payments.some((item) => item.type === "deposit")) throw new Error("A deposit is already recorded; correct it instead.");
      const total = cents(record.issuedInvoice ? record.issuedInvoice.total : record.finalCustomerPrice);
      const received = [...payments, payment].reduce((sum, item) => sum + cents(item.amount), 0);
      if (!(total > 0) || received > total) throw new Error("Payments cannot exceed the saved customer price.");
      return [...payments, payment];
    }
    function issuedInvoice(record, data) {
      if (record.issuedInvoice) throw new Error("An invoice has already been issued for this build.");
      const invoice = data && data.invoice;
      if (!invoice || typeof invoice !== "object" || typeof invoice.total !== "number" || !validDate(invoice.issuedDate)
        || !same(invoice.payments, Array.isArray(record.payments) ? record.payments : []) || cents(invoice.total) !== cents(record.finalCustomerPrice)) {
        throw new Error("Invoice does not match the saved build.");
      }
      return clone(invoice);
    }
    return Object.freeze({
      demo: true,
      busy: () => inFlight,
      pendingFinancial: () => null,
      retryFinancial: async () => { throw new Error("There is no unconfirmed transaction in the demonstration."); },
      async financialOperation(buildId, kind, data) {
        if (inFlight) throw new Error("A financial operation is already in progress.");
        inFlight = true;
        try {
          await Promise.resolve();
          const id = String(buildId);
          const list = typeof window.savedBuildRecords === "function" ? window.savedBuildRecords() : [];
          const record = list.find((item) => item && String(item.id) === id);
          if (!record) throw new Error("Save this build before recording a payment.");
          const next = clone(record);
          if (kind === "add_payment") next.payments = nextPayments(record, data);
          else if (kind === "issue_invoice") next.issuedInvoice = issuedInvoice(record, data);
          else throw new Error("This transaction is not part of the demonstration.");
          if (window.saveBuildRecords([next, ...list.filter((item) => !item || String(item.id) !== id)]) === false) {
            throw new Error("The demonstration could not record this.");
          }
          window.KLABS_UI?.refreshBuildViews?.();
          return { operation: { id: `demo-${kind}`, buildId: id, kind }, record: clone(next), conflict: false };
        } finally {
          inFlight = false;
        }
      }
    });
  } // end demoFinancialService

  // Q18: open the real interface with the fictional demonstration data. Only on a demo page (js/demo-mode.js decides
  // before anything else runs). No account, session, entitlement, sync or administration is involved. The visitor
  // shield is installed before any Studio script runs; Studio is then editable, but only the demonstration director
  // can change anything (the Store refuses every other write). The visitor lands on the demonstration's introduction
  // screen, not on a saved job. If the isolation guards or the shield could not be confirmed, or anything fails while
  // opening, the visitor is returned to the normal public entry screen with a short notice and nothing is shown.
  async function startDemo(applyAuthState) {
    const demo = window.KLABS_DEMO;
    if (!demo?.active) return false;
    document.body.classList.add("klabs-auth-resolving");
    document.getElementById("authScreen").style.display = "none";
    setVisible("accountAccessScreen", false);
    setVisible("exploreDemoScreen", false);
    const sameBuild = (part, build) => {
      if (build === DEMO_BUILD) return;
      const error = new Error(`An older copy of the demonstration's ${part} (${build || "unknown"}) is cached; this is ${DEMO_BUILD}.`);
      error.demoStale = true;
      throw error;
    };
    try {
      if (!demo.isolated) throw new Error(demo.failure || "Demo Mode isolation could not be confirmed.");
      sameBuild("page", document.getElementById("demoModeBar")?.getAttribute("data-demo-build"));
      sameBuild("guard", demo.build);
      demo.installShield(document);
      window.KLABS_ACCESS_STATE = { access_state: "demo", can_write: true, trial_available: false, email_verified: false, demo: true };
      // Local stand-in for the quote-number service (js/quote-number-allocator.js is not loaded). Numbers continue the
      // demonstration business's own sequence (Studio passes its floor, from the demo business profile), are held in
      // memory for this page only and never reach a server; each replay starts again from the same number.
      let demoNextQuoteNumber = null;
      window.KLABS_QUOTE_NUMBERS = {
        peek: async () => ({ userId: demo.accountId, nextNumber: demoNextQuoteNumber }),
        allocate: async (floor) => {
          const number = Math.max(Math.round(Number(floor)) || 1, demoNextQuoteNumber || 1);
          demoNextQuoteNumber = number + 1;
          return number;
        }
      };
      for (const src of demoScripts) {
        await loadScript(src);
        if (src === "js/demo-data.js") {
          sameBuild("data", window.KLABS_DEMO_DATA?.build);
          demo.seed(window.KLABS_DEMO_DATA);
        }
        // A missing player is not an older copy: it stops below, as before.
        if (src === "js/demo-director.js" && window.KLABS_DEMO_PLAYER) sameBuild("player", window.KLABS_DEMO_PLAYER.build);
      }
      if (window.Store !== demo.store || window.KLABS_ACCOUNT_ID !== demo.accountId || window.KLABS_SUPABASE_CLIENT
        || window.KLABS_BUILD_SYNC || window.KLABS_SYNC || window.KLABS_SETTINGS_SYNC || window.KLABS_ADMIN_ACCESS) {
        throw new Error("Demo Mode isolation changed while opening.");
      }
      // 2B: the payment stand-in, put in place only now that no real sync module is present; it cannot be replaced.
      const demoFinancial = demoFinancialService();
      Object.defineProperty(window, "KLABS_BUILD_SYNC", { value: demoFinancial, writable: false, configurable: false, enumerable: true });
      if (window.KLABS_BUILD_SYNC !== demoFinancial) throw new Error("Demo Mode isolation changed while opening.");
      if (typeof window.KLABS_DEMO_PLAYER?.open !== "function") throw new Error("The demonstration player is unavailable.");
      const director = demo.claimDirector();
      applyAuthState({ user: { id: demo.accountId, email: "Demonstration" } });
      setVisible("demoModeBar", true);
      window.KLABS_DEMO_PLAYER.open(director);
      return true;
    } catch (error) {
      console.warn("[K-Labs Studio] Demo Mode could not open safely:", error);
      if (error?.demoStale && !freshReload()) {
        await askForNewVersion();
        window.location.replace(`${demo.enterUrl()}&${DEMO_FRESH_PARAM}=1`);
        return false;
      }
      window.location.replace(demo.exitUrl() + DEMO_UNAVAILABLE_HASH);
      return false;
    }
  }
  function freshReload() {
    return new RegExp(`[?&]${DEMO_FRESH_PARAM}=1(?:&|$)`).test(String(window.location.search || ""));
  }
  // Asks the service worker to fetch the new version and, if one starts installing, waits a little for it to take
  // over (at most a few seconds); then the reload gets one consistent set of files.
  async function askForNewVersion() {
    const timeout = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
    try {
      const workers = window.navigator?.serviceWorker;
      const registration = workers && typeof workers.getRegistration === "function" ? await workers.getRegistration() : null;
      if (!registration || typeof registration.update !== "function") return;
      await Promise.race([registration.update(), timeout(4000)]);
      if (registration.installing || registration.waiting) {
        await Promise.race([new Promise((resolve) => workers.addEventListener("controllerchange", resolve, { once: true })), timeout(5000)]);
      }
    } catch (error) {
      // A reload is still the best that can be done.
    }
  }

  // Q17: the stored sign-in has expired and the server cannot be reached to renew it. Open this account's saved records
  // strictly view-only from its own saved access record - no Supabase data calls, no sync, no documents - and restart
  // normally as soon as the renewal succeeds or is refused. Without a valid saved record for this exact account,
  // nothing opens.
  async function applyOfflineSession(stored, applyAuthState, renewal) {
    const userId = stored?.user?.id;
    const access = typeof userId === "string" && userId ? cachedEntitlementFor(userId) : null;
    const openable = ["trial", "expired", "grandfathered", "complimentary", "paid"];
    if (!access || !openable.includes(access.access_state) || typeof access.email_verified !== "boolean"
      || (access.access_state === "trial" && !access.trial_expires_at)) {
      watchRenewal(renewal, true);
      throw new Error("Could not restore your session. Check your connection and try again.");
    }
    currentSession = { user: { id: userId, email: typeof stored.user.email === "string" ? stored.user.email : "" } };
    document.body.classList.add("klabs-auth-resolving");
    preloadPrivateApp();
    try {
      await window.KLABS_BUILD_TAB_LOCK.acquire(userId);
      currentEntitlement = { ...access, can_write: false, trial_available: false, offline: true, offline_session: true };
      window.KLABS_ACCESS_STATE = { ...currentEntitlement };
      setVisible("accountAccessScreen", false);
      setVisible("exploreDemoScreen", false);
      document.body.classList.remove("klabs-entry-choice", "klabs-explore-demo");
      document.body.classList.add("klabs-offline-session");
      await loadPrivateApp();
      applyAuthState(currentSession);
    } catch (error) {
      window.KLABS_BUILD_TAB_LOCK?.release();
      window.KLABS_ACCESS_STATE = null;
      document.body.classList.remove("klabs-auth-resolving", "klabs-offline-session");
      document.getElementById("app").style.display = "none";
      document.getElementById("authScreen").style.display = "flex";
      document.body.classList.add("klabs-auth-open");
      throw error;
    }
    document.body.classList.remove("klabs-auth-open");
    pendingDestination = "";
    watchRenewal(renewal);
  }

  document.addEventListener("DOMContentLoaded", () => {
    window.addEventListener("online", () => {
      if (window.KLABS_ACCESS_STATE?.offline) window.location.reload();
      else verifyCurrentAccountBlock();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") verifyCurrentAccountBlock();
    });
    window.setInterval(() => {
      if (document.visibilityState === "visible") verifyCurrentAccountBlock();
    }, 15000);
    const rod = document.getElementById("homeLivingRod");
    const leds = rod.querySelector(".home-living-rod__leds");
    [8, 18, 30, 43, 57, 71, 84, 94].forEach((x) => {
      const led = document.createElement("span");
      led.className = "home-living-rod__led is-resting";
      led.style.setProperty("--x", `${x}%`);
      led.style.setProperty("--y", "53.5%");
      leds.appendChild(led);
    });
    rod.classList.add("is-ready");
    // Q24: Explore Studio opens Demo Mode (?demo), whose introduction offers Build a Rod | Components Library. Sign In
    // stays the way into an account (and on to creating one).
    document.getElementById("publicExploreBtn").addEventListener("click", () => window.KLABS_DEMO.enter());
    document.getElementById("demoModeExitBtn").addEventListener("click", () => window.KLABS_DEMO?.exit());
    if (!window.KLABS_DEMO?.active && window.location.hash === DEMO_UNAVAILABLE_HASH) {
      setVisible("publicDemoUnavailable", true);
      try { window.history.replaceState(null, "", window.location.pathname + window.location.search); } catch (error) { /* notice stays */ }
    }
    document.getElementById("publicSignInBtn").addEventListener("click", () => showAuth(""));
    document.getElementById("authBackHome").addEventListener("click", showHome);
    document.getElementById("startTrialBtn").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      const errorMessage = document.getElementById("accountAccessError");
      button.disabled = true;
      errorMessage.textContent = "Starting your seven-day trial...";
      try {
        const { error } = await window.KLABS_SUPABASE_CLIENT.rpc("start_account_trial");
        if (error) throw error;
        await applySession(currentSession, window.KLABS_APPLY_AUTH_STATE);
      } catch (error) {
        errorMessage.textContent = error?.message || "Could not start your trial. Please try again.";
      } finally {
        button.disabled = false;
      }
    });
    document.getElementById("demoStartTrialBtn").addEventListener("click", () => {
      document.getElementById("exploreDemoScreen").hidden = true;
      showAccessChoice(currentEntitlement);
      window.scrollTo(0, 0);
    });
    document.getElementById("enterExploreDemoBtn").addEventListener("click", showExploreDemo);
    document.getElementById("verifyEmailContinueBtn").addEventListener("click", async () => {
      const errorMessage = document.getElementById("accountAccessError");
      errorMessage.textContent = "Checking email verification...";
      try {
        const entitlement = await refreshEntitlement();
        currentEntitlement = entitlement;
        showAccessChoice(entitlement);
        if (entitlement.email_verified) document.getElementById("accountAccessMessage").textContent = "Email verified. You can now explore or start your trial.";
      } catch (error) {
        errorMessage.textContent = error?.message || "Could not verify account access. Please try again.";
      }
    });
    [["accessSignOutBtn", "accountAccessError"], ["demoSignOutBtn", "demoAccessError"]].forEach(([id, messageId]) => {
      document.getElementById(id).addEventListener("click", () => {
        signOutFromEntry(messageId).catch((error) => {
          document.getElementById(messageId).textContent = error?.message || "Could not sign out. Please try again.";
        });
      });
    });
    document.querySelectorAll("[data-demo-view]").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll("[data-demo-view]").forEach((item) => item.removeAttribute("aria-current"));
        button.setAttribute("aria-current", "page");
        document.querySelectorAll("[data-demo-panel]").forEach((panel) => {
          panel.hidden = panel.dataset.demoPanel !== button.dataset.demoView;
        });
      });
    });
    document.addEventListener("click", (event) => {
      if (!document.body.classList.contains("klabs-logged-out")) return;
      const nav = event.target.closest("[data-nav]");
      if (!nav || nav.dataset.nav === "homeScreen") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      showAuth(nav.dataset.nav);
    }, true);
    if (!window.KLABS_SUPABASE_CLIENT && !window.KLABS_DEMO?.active) {
      showHome();
      document.getElementById("authMessage").textContent = "Sign in is unavailable. Check your connection and reload.";
    }
  });

  if (hasStoredSession()) preloadPrivateApp();

  window.KLABS_PUBLIC_ENTRY = { applySession, applyOfflineSession, startDemo, showHome, isLoading: () => !!loadPromise };
})();
