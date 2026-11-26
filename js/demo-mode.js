/* Q18 Demo Mode: the real Studio interface with fictional demonstration data, for visitors who are not signed in.
 *
 * Demo Mode is a separate page load (index.html?demo). It is decided here, before any other script runs, and
 * cannot be switched on inside a signed-in page. On a demo page:
 *  - browser storage (localStorage, sessionStorage) is replaced by an in-memory copy that starts empty: nothing on
 *    this device is read, and nothing written survives the page;
 *  - IndexedDB, cookies, beacons, WebSockets and EventSource are unavailable;
 *  - the network is limited to reading this site's own files (same-origin GET/HEAD) - nothing can be sent anywhere;
 *  - window.Store (the app's only storage path) is an in-memory store seeded with the demonstration data. It accepts
 *    a change only while the demonstration director is running a step (claimDirector, below);
 *  - printing, sharing, new windows and file downloads are unavailable, and the controls that would do them (email
 *    drafts, print/PDF, external links) are hidden and disabled;
 *  - the Supabase client, sync, owner administration and the service worker are never started (see
 *    supabase-client.js, public-entry.js and app.js);
 *  - once the page is ready, the visitor shield (installShield) turns away every action a person makes on Studio:
 *    the visitor watches, and only the demonstration's own controls (Start, Exit demo) respond.
 * If any of the guards cannot be confirmed, Demo Mode does not open (KLABS_DEMO.isolated stays false, or
 * installShield throws and public-entry.js returns to the public entry screen).
 * Outside Demo Mode this file only publishes KLABS_DEMO = { active: false, ... } and changes nothing. */
(function () {
  "use strict";
  const DEMO_ACCOUNT_ID = "klabs-demo";
  const DEMO_PARAM = "demo";
  let active = false;
  try {
    active = new URLSearchParams(window.location.search).has(DEMO_PARAM);
  } catch (error) {
    active = false;
  }
  // Address of this page without any query or fragment: the public entry screen.
  function exitUrl() {
    return window.location.pathname || "./";
  }
  function enterUrl() {
    return `${exitUrl()}?${DEMO_PARAM}`;
  }
  const api = {
    active,
    // Phase 3 review: the build of the demonstration files (checked by js/public-entry.js before anything is shown).
    build: "build148-v293",
    accountId: DEMO_ACCOUNT_ID,
    isolated: false,
    failure: "",
    refused: [],
    enterUrl,
    exitUrl,
    enter() { window.location.assign(enterUrl()); },
    exit() { window.location.assign(exitUrl()); },
    frameGuardScript: "",
    shielded: false,
    installShield() { throw new Error("Demo Mode is not active on this page."); }
  };
  window.KLABS_DEMO = api;
  if (!active) return;

  document.documentElement.classList.add("klabs-demo");
  const refuse = (kind, detail) => {
    if (api.refused.length < 200) api.refused.push({ kind, detail: String(detail || "").slice(0, 200) });
  };

  // ---- Browser storage: an in-memory overlay. Shared with the embedded tools (see frameGuardScript).
  function memoryStorageGuard(win) {
    const proto = win.Storage && win.Storage.prototype;
    if (!proto) throw new Error("Storage is unavailable.");
    const areas = new Map();
    const area = (storage) => {
      let local = null;
      let session = null;
      try { local = win.localStorage; } catch (error) { local = null; }
      try { session = win.sessionStorage; } catch (error) { session = null; }
      if (storage !== local && storage !== session) return null;
      if (!areas.has(storage)) areas.set(storage, new Map());
      return areas.get(storage);
    };
    const native = { getItem: proto.getItem, setItem: proto.setItem, removeItem: proto.removeItem, clear: proto.clear, key: proto.key };
    const nativeLength = Object.getOwnPropertyDescriptor(proto, "length");
    proto.getItem = function (key) {
      const memory = area(this);
      if (!memory) return native.getItem.call(this, key);
      return memory.has(String(key)) ? memory.get(String(key)) : null;
    };
    proto.setItem = function (key, value) {
      const memory = area(this);
      if (!memory) return native.setItem.call(this, key, value);
      memory.set(String(key), String(value));
    };
    proto.removeItem = function (key) {
      const memory = area(this);
      if (!memory) return native.removeItem.call(this, key);
      memory.delete(String(key));
    };
    proto.clear = function () {
      const memory = area(this);
      if (!memory) return native.clear.call(this);
      memory.clear();
    };
    proto.key = function (index) {
      const memory = area(this);
      if (!memory) return native.key.call(this, index);
      const keys = [...memory.keys()];
      return index >= 0 && index < keys.length ? keys[index] : null;
    };
    Object.defineProperty(proto, "length", {
      configurable: true,
      get() {
        const memory = area(this);
        return memory ? memory.size : nativeLength.get.call(this);
      }
    });
  }

  function blockPersistence(win, record) {
    try {
      if (win.IDBFactory && win.IDBFactory.prototype) {
        ["open", "deleteDatabase"].forEach((name) => {
          win.IDBFactory.prototype[name] = function () {
            record("indexeddb", name);
            throw new win.DOMException("Storage is disabled in Demo Mode.", "SecurityError");
          };
        });
      }
    } catch (error) { /* checked below */ }
    try { Object.defineProperty(win, "indexedDB", { configurable: true, get() { return undefined; } }); } catch (error) { /* checked below */ }
    try {
      Object.defineProperty(win.document, "cookie", {
        configurable: true,
        get() { return ""; },
        set(value) { record("cookie", String(value).split("=")[0]); }
      });
    } catch (error) { /* checked below */ }
  }

  function blockNetwork(win, record) {
    const origin = win.location.origin;
    const allowed = (url, method) => {
      let target;
      try { target = new URL(url, win.location.href); } catch (error) { return false; }
      return target.origin === origin && (method === "GET" || method === "HEAD");
    };
    const nativeFetch = win.fetch;
    win.fetch = function (input, init) {
      const url = typeof input === "string" ? input : (input && (input.href || input.url)) || String(input);
      const method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
      if (!allowed(url, method)) {
        record("network", `${method} ${url}`);
        return Promise.reject(new TypeError("Network requests are disabled in Demo Mode."));
      }
      return nativeFetch.call(win, input, init);
    };
    if (win.XMLHttpRequest) {
      const open = win.XMLHttpRequest.prototype.open;
      const send = win.XMLHttpRequest.prototype.send;
      win.XMLHttpRequest.prototype.open = function (method, url) {
        this.__klabsDemoAllowed = allowed(url, String(method || "GET").toUpperCase());
        this.__klabsDemoTarget = `${method} ${url}`;
        return open.apply(this, arguments);
      };
      win.XMLHttpRequest.prototype.send = function () {
        if (!this.__klabsDemoAllowed) {
          record("network", this.__klabsDemoTarget);
          throw new win.DOMException("Network requests are disabled in Demo Mode.", "NetworkError");
        }
        return send.apply(this, arguments);
      };
    }
    if (win.navigator && typeof win.navigator.sendBeacon === "function") {
      try {
        Object.defineProperty(win.navigator, "sendBeacon", { configurable: true, value: (url) => { record("network", `BEACON ${url}`); return false; } });
      } catch (error) { /* checked below */ }
    }
    ["WebSocket", "EventSource"].forEach((name) => {
      if (!win[name]) return;
      win[name] = function (url) {
        record("network", `${name} ${url}`);
        throw new win.DOMException("Network connections are disabled in Demo Mode.", "SecurityError");
      };
    });
  }

  // Printing, sharing and new windows are unavailable to everyone on a demo page, the director included.
  function blockOutputs(win, record) {
    win.print = function () { record("output", "print"); };
    win.open = function (url) { record("output", `open ${url}`); return null; };
    if (win.navigator) {
      Object.defineProperty(win.navigator, "share", { configurable: true, value: () => {
        record("output", "share");
        return Promise.reject(new win.DOMException("Sharing is disabled in Demo Mode.", "NotAllowedError"));
      } });
      Object.defineProperty(win.navigator, "canShare", { configurable: true, value: () => false });
    }
  }

  // Embedded tools in Demo Mode show their own example values; visitors cannot type their own (same rule as the
  // app's read-only controls: text fields read-only, every other control disabled).
  function lockFrameInputs(win) {
    const lock = () => {
      win.document.querySelectorAll("input, textarea, select").forEach((control) => {
        if (control.tagName === "TEXTAREA" || ["text", "number", "search", "email", "tel", "url"].includes(control.type)) control.readOnly = true;
        else control.disabled = true;
      });
    };
    win.document.addEventListener("DOMContentLoaded", () => {
      lock();
      new win.MutationObserver(lock).observe(win.document.documentElement, { childList: true, subtree: true });
    });
  }

  // The same guards as source text, injected first into the embedded tool documents (KR Guide Layout, Thread Design
  // Studio), which have their own window and storage.
  // If the guards cannot be installed there, the embedded document is stopped and blanked instead of running unguarded.
  api.frameGuardScript = `(function(){try{var r=function(){};(${memoryStorageGuard.toString()})(window);(${blockPersistence.toString()})(window,r);(${blockNetwork.toString()})(window,r);(${lockFrameInputs.toString()})(window);if(window.indexedDB!==undefined)throw new Error("indexedDB");window.__KLABS_DEMO_FRAME_ISOLATED__=true;}catch(e){try{window.stop();}catch(x){}document.open();document.write("<p>This tool is unavailable in Demo Mode on this browser.</p>");document.close();throw e;}})();`;

  // ---- In-memory Store (the app's only storage path; js/storage.js is not loaded in Demo Mode). Studio is editable in
  // Demo Mode, but the Store accepts a change only while the demonstration director is running a step (and, like
  // js/storage.js, never while the access state is view-only). Anything else - including anything a visitor could
  // somehow cause - is refused, so the data changes only as the script makes it change.
  const memory = new Map();
  let seeding = false;
  let directorSteps = 0;
  let directorSuspended = false;
  let writes = 0;
  let directorClaimed = false;
  const memoryStore = {
    get(key, fallback) {
      if (!memory.has(key)) return fallback;
      try { return JSON.parse(memory.get(key)) ?? fallback; } catch (error) { return fallback; }
    },
    set(key, value) {
      const canWrite = typeof window.KLABS_CAN_WRITE === "function" ? window.KLABS_CAN_WRITE() : window.KLABS_ACCESS_STATE?.can_write !== false;
      if (!seeding && (directorSteps === 0 || directorSuspended || !canWrite)) {
        if (window.KLABS_ACCESS_STATE) window.KLABS_ACCESS_STATE.writeBlocked = true;
        refuse("store", key);
        return false;
      }
      memory.set(key, JSON.stringify(value));
      if (!seeding) writes += 1;
      return true;
    }
  };
  api.store = memoryStore;
  api.storeKeys = () => [...memory.keys()];
  // How many changes the Store has accepted: the player waits for this to stand still before closing the write window.
  api.writeCount = () => writes;

  // The director channel: the only way to change demo data. It can be claimed once per page (public-entry.js hands it
  // straight to the demonstration player); a step's write window stays open until the step has fully finished,
  // including anything it waits for, and closes even if the step fails. While the visitor has paused the
  // demonstration the window is closed (suspend) and Play reopens it (resume); a pause never outlives the step, and
  // resuming outside a step opens nothing.
  api.claimDirector = function () {
    if (directorClaimed) throw new Error("The demonstration director is already in use.");
    directorClaimed = true;
    return Object.freeze({
      async run(step) {
        directorSteps += 1;
        try {
          return await step();
        } finally {
          directorSteps -= 1;
          if (directorSteps === 0) directorSuspended = false;
        }
      },
      suspend() { if (directorSteps > 0) directorSuspended = true; },
      resume() { directorSuspended = false; }
    });
  };

  // ---- Visitor shield. Installed by public-entry.js before any Studio script runs, so its listeners on window are the
  // first to see every event. Actions made by a person (isTrusted) on anything outside the demonstration's own
  // controls ([data-demo-player]) are stopped before Studio sees them and lose their default effect (focus, typing,
  // submitting, text selection); a touch may still scroll the page. Actions performed by the director are not made by
  // a person and pass through to the real controls. Focus never stays on Studio, so no keyboard opens. File downloads
  // are refused for every click. The #demoShield overlay covers the page as a second, visible layer.
  const SHIELD_EVENTS = ["click", "dblclick", "auxclick", "contextmenu", "mousedown", "mouseup", "pointerdown", "pointerup", "touchstart", "touchend",
    "keydown", "keyup", "keypress", "beforeinput", "input", "change", "paste", "cut", "drop", "dragstart", "submit"];
  const DOWNLOAD_LINKS = 'a[download], a[href^="blob:"], a[href^="data:"], a[href^="mailto:"]';
  // Controls that would take something out of the app - an email draft, printing or a PDF, a file, an external page -
  // and More documents. In Demo Mode they are hidden and disabled (not only guarded), including those Studio builds
  // later, such as the customer quote sheet's Email and the invoice preview's PDF, and those
  // Studio shows again by itself (PDF once an invoice is issued).
  const OUTPUT_CONTROLS = ['#viewQuoteEmailBtn', '#workshopGripPrintActions', '[data-grip-template-action="print"]',
    '[data-invoice-preview-action="print"]', '#studioRecoveryExportBtn', 'a[target="_blank"]', 'a[href^="mailto:"]', 'a[href^="tel:"]', 'a[download]',
    '#quoteMoreDocumentsWrap'];
  function lockOutputControls(doc) {
    const selector = OUTPUT_CONTROLS.join(", ");
    if (!doc.head || typeof doc.createElement !== "function" || typeof doc.querySelectorAll !== "function" || typeof window.MutationObserver !== "function") {
      throw new Error("The outgoing controls could not be hidden.");
    }
    const style = doc.createElement("style");
    style.setAttribute("data-demo-output-lock", "");
    style.textContent = `${selector} { display: none !important; }`;
    doc.head.appendChild(style);
    // Only what is not locked yet is changed, so locking never sets the observer off again.
    const lock = () => {
      doc.querySelectorAll(selector).forEach((control) => {
        if (control.hidden !== true) control.hidden = true;
        if (control.disabled !== true) control.disabled = true;
        if (control.tabIndex !== -1) control.tabIndex = -1;
        if (typeof control.getAttribute !== "function" || control.getAttribute("aria-hidden") !== "true") control.setAttribute("aria-hidden", "true");
      });
    };
    lock();
    new window.MutationObserver(lock).observe(doc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "disabled"] });
  }
  function installShield(doc) {
    if (api.shielded) return true;
    const overlay = doc.getElementById("demoShield");
    if (!overlay) throw new Error("The visitor shield is missing from this page.");
    lockOutputControls(doc);
    const element = (target) => (target && target.nodeType === 3 ? target.parentElement : target);
    const inPlayer = (target) => !!(target && typeof target.closest === "function" && target.closest("[data-demo-player]"));
    const shield = (event) => {
      const target = element(event.target);
      if (event.type === "click" && target && typeof target.closest === "function" && target.closest(DOWNLOAD_LINKS)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        refuse("output", "download");
        return;
      }
      if (!event.isTrusted || inPlayer(target)) return;
      if (event.type !== "touchstart") event.preventDefault();
      event.stopImmediatePropagation();
    };
    SHIELD_EVENTS.forEach((type) => window.addEventListener(type, shield, { capture: true, passive: false }));
    window.addEventListener("focusin", (event) => {
      const target = element(event.target);
      if (!target || target === doc.body || target === doc.documentElement || inPlayer(target)) return;
      if (typeof target.blur === "function") target.blur();
    }, true);
    overlay.hidden = false;
    const style = typeof window.getComputedStyle === "function" ? window.getComputedStyle(overlay) : null;
    if (!style || style.position !== "fixed" || style.pointerEvents === "none") {
      throw new Error("The visitor shield does not cover the page.");
    }
    api.shielded = true;
    return true;
  }

  // Seeds the in-memory Store from KLABS_DEMO_DATA (js/demo-data.js). Keys ending in ":" are per-account and get the
  // demonstration account id; every other key is used as written.
  // Dates in the data are moved by whole days so they keep the same distance from today as from data.anchor.
  api.seed = function (data, today) {
    memory.clear();
    const records = (data && data.store) || {};
    const anchor = Date.parse(`${(data && data.anchor) || ""}T00:00:00Z`);
    const now = today instanceof Date ? today : new Date();
    const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const shift = Number.isFinite(anchor) ? Math.round((todayUtc - anchor) / 86400000) * 86400000 : 0;
    const moveDate = (value) => {
      const match = /^(\d{4}-\d{2}-\d{2})(T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)?$/.exec(value);
      if (!match || !shift) return value;
      const moved = new Date(Date.parse(match[2] ? value : `${value}T00:00:00Z`) + shift).toISOString();
      return match[2] ? moved : moved.slice(0, 10);
    };
    const move = (value) => {
      if (typeof value === "string") return moveDate(value);
      if (Array.isArray(value)) return value.map(move);
      if (value && typeof value === "object") {
        const next = {};
        Object.keys(value).forEach((key) => { next[key] = move(value[key]); });
        return next;
      }
      return value;
    };
    seeding = true;
    try {
      Object.keys(records).forEach((key) => {
        memoryStore.set(key.endsWith(":") ? key + DEMO_ACCOUNT_ID : key, move(records[key]));
      });
    } finally {
      seeding = false;
    }
  };

  // Every guard is checked; if one did not take effect, Demo Mode stays closed.
  function verify() {
    const probe = "klabs-demo-isolation-probe";
    window.localStorage.setItem(probe, "1");
    if (window.localStorage.getItem(probe) !== "1") throw new Error("Storage overlay is not readable.");
    window.localStorage.removeItem(probe);
    if (window.localStorage.length !== 0) throw new Error("Storage overlay is not empty.");
    window.sessionStorage.setItem(probe, "1");
    window.sessionStorage.removeItem(probe);
    if (window.indexedDB !== undefined) throw new Error("IndexedDB is still available.");
    document.cookie = `${probe}=1`;
    if (document.cookie !== "") throw new Error("Cookies are still writable.");
    if (window.Store !== memoryStore) throw new Error("The in-memory store is not active.");
    if (window.navigator && typeof window.navigator.canShare === "function" && window.navigator.canShare({})) throw new Error("Sharing is still available.");
    if (window.open("about:blank") !== null) throw new Error("New windows are still available.");
  }

  try {
    memoryStorageGuard(window);
    blockPersistence(window, refuse);
    blockNetwork(window, refuse);
    blockOutputs(window, refuse);
    window.Store = memoryStore;
    window.KLABS_ACCOUNT_ID = DEMO_ACCOUNT_ID;
    verify();
    api.refused.length = 0;
    api.isolated = true;
    api.installShield = installShield;
  } catch (error) {
    api.isolated = false;
    api.failure = error && error.message ? error.message : String(error);
  }
})();
