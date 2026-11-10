(function () {
  const privateScripts = [
    "js/config.js", "js/storage.js", "js/guide-layout.js", "js/thread-wrap.js",
    "js/guide-train.js", "js/studio-visuals.js", "js/navigation.js", "js/ui.js",
    "js/component-sync.js", "js/build-sync.js", "js/settings-sync.js",
    "js/admin-panel.js", "js/quote-number-allocator.js", "js/app.js"
  ];
  let loadPromise = null;
  let pendingDestination = "";
  let currentSession = null;
  let currentEntitlement = null;
  let trialExpiryTimer = null;

  function setVisible(id, visible) {
    const element = document.getElementById(id);
    if (element) element.hidden = !visible;
  }

  function entitlementCanWrite() {
    const access = window.KLABS_ACCESS_STATE;
    if (!access) return true;
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

  function showHome() {
    if (trialExpiryTimer) window.clearTimeout(trialExpiryTimer);
    trialExpiryTimer = null;
    currentSession = null;
    currentEntitlement = null;
    window.KLABS_ACCESS_STATE = null;
    document.getElementById("authScreen").style.display = "none";
    setVisible("accountAccessScreen", false);
    setVisible("exploreDemoScreen", false);
    document.getElementById("app").style.display = "";
    document.body.classList.add("klabs-logged-out");
    document.body.classList.remove("klabs-auth-resolving", "klabs-auth-open", "klabs-entry-choice", "klabs-explore-demo", "klabs-read-only");
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

  async function refreshEntitlement() {
    const { data, error } = await window.KLABS_SUPABASE_CLIENT.rpc("get_account_entitlement");
    if (error) {
      const networkFailure = window.navigator?.onLine === false
        || error.name === "TypeError"
        || /network|fetch failed|offline|timed? ?out/i.test(error.message || "");
      if (!networkFailure) throw error;
      const key = `klabs-account-entitlement:${currentSession?.user?.id || ""}`;
      let cached;
      try {
        cached = JSON.parse(window.localStorage.getItem(key) || "null");
      } catch {
        cached = null;
      }
      if (!cached || cached.user_id !== currentSession?.user?.id || !cached.entitlement || !cached.saved_at) {
        return {
          access_state: "offline_readonly",
          can_write: false,
          trial_available: false,
          email_verified: false,
          offline: true,
          server_time: new Date().toISOString()
        };
      }
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

  function loadPrivateApp() {
    if (!loadPromise) {
      loadPromise = privateScripts.reduce((previous, src) => previous.then(() => new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = src;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Could not load ${src}. Reload and try again.`));
        document.head.appendChild(script);
      })), Promise.resolve());
    }
    return loadPromise;
  }

  async function applySession(session, applyAuthState) {
    if (!session?.user?.id) {
      showHome();
      return;
    }
    currentSession = session;
    document.body.classList.add("klabs-auth-resolving");
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
        showAccessChoice(entitlement);
        return;
      }
      window.KLABS_ACCESS_STATE = entitlement;
      scheduleEntitlementExpiry(entitlement);
      setVisible("accountAccessScreen", false);
      setVisible("exploreDemoScreen", false);
      document.body.classList.remove("klabs-entry-choice", "klabs-explore-demo");
      await loadPrivateApp();
      const { data: latestData, error: latestError } = await window.KLABS_SUPABASE_CLIENT.auth.getSession();
      if (latestError) throw latestError;
      if (latestData?.session?.user?.id !== session.user.id) {
        window.location.reload();
        return;
      }
      applyAuthState(latestData.session);
    } catch (error) {
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

  document.addEventListener("DOMContentLoaded", () => {
    window.addEventListener("online", () => {
      if (window.KLABS_ACCESS_STATE?.offline) window.location.reload();
    });
    const dialog = document.getElementById("publicDiscoverDialog");
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
    document.getElementById("publicExploreBtn").addEventListener("click", () => showAuth("workshopScreen"));
    document.getElementById("publicSignInBtn").addEventListener("click", () => showAuth(""));
    document.getElementById("authBackHome").addEventListener("click", showHome);
    document.getElementById("publicDiscoverBtn").addEventListener("click", () => dialog.showModal());
    document.getElementById("publicDiscoverClose").addEventListener("click", () => dialog.close());
    document.getElementById("publicDiscoverExploreBtn").addEventListener("click", () => {
      dialog.close();
      showAuth("workshopScreen");
    });
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
    if (!window.KLABS_SUPABASE_CLIENT) {
      showHome();
      document.getElementById("authMessage").textContent = "Sign in is unavailable. Check your connection and reload.";
    }
  });

  window.KLABS_PUBLIC_ENTRY = { applySession, showHome, isLoading: () => !!loadPromise };
})();
