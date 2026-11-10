(function () {
  const privateScripts = [
    "js/config.js", "js/storage.js", "js/guide-layout.js", "js/thread-wrap.js",
    "js/guide-train.js", "js/studio-visuals.js", "js/navigation.js", "js/ui.js",
    "js/component-sync.js", "js/build-sync.js", "js/settings-sync.js",
    "js/quote-number-allocator.js", "js/app.js"
  ];
  let loadPromise = null;
  let pendingDestination = "";

  function showHome() {
    document.getElementById("authScreen").style.display = "none";
    document.getElementById("app").style.display = "";
    document.body.classList.add("klabs-logged-out");
    document.body.classList.remove("klabs-auth-resolving", "klabs-auth-open");
  }

  function showAuth(destination) {
    pendingDestination = destination || "";
    document.getElementById("authForm").hidden = false;
    document.getElementById("authShowSignUp").hidden = false;
    document.getElementById("authSignUpForm").hidden = true;
    document.getElementById("app").style.display = "none";
    document.getElementById("authScreen").style.display = "flex";
    document.body.classList.add("klabs-auth-open");
    document.getElementById("authEmail").focus();
    window.scrollTo(0, 0);
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
    document.body.classList.add("klabs-auth-resolving");
    try {
      await loadPrivateApp();
      const { data, error } = await window.KLABS_SUPABASE_CLIENT.auth.getSession();
      if (error) throw error;
      if (data?.session?.user?.id !== session.user.id) {
        window.location.reload();
        return;
      }
      applyAuthState(data.session);
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
