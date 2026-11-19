/* Q18 Demo Mode: the real Studio interface with fictional demonstration data, for visitors who are not signed in.
 *
 * Demo Mode is a separate page load (index.html?demo). It is decided here, before any other script runs, and
 * cannot be switched on inside a signed-in page. On a demo page:
 *  - browser storage (localStorage, sessionStorage) is replaced by an in-memory copy that starts empty: nothing on
 *    this device is read, and nothing written survives the page;
 *  - IndexedDB, cookies, beacons, WebSockets and EventSource are unavailable;
 *  - the network is limited to reading this site's own files (same-origin GET/HEAD) - nothing can be sent anywhere;
 *  - window.Store (the app's only storage path) is an in-memory store seeded with the demonstration data;
 *  - the Supabase client, sync, owner administration and the service worker are never started (see
 *    supabase-client.js, public-entry.js and app.js).
 * If any of the guards cannot be confirmed, Demo Mode does not open (KLABS_DEMO.isolated stays false).
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
    accountId: DEMO_ACCOUNT_ID,
    isolated: false,
    failure: "",
    refused: [],
    enterUrl,
    exitUrl,
    enter() { window.location.assign(enterUrl()); },
    exit() { window.location.assign(exitUrl()); },
    frameGuardScript: ""
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

  // ---- In-memory Store (the app's only storage path; js/storage.js is not loaded in Demo Mode). Like js/storage.js it
  // refuses writes while the access state is view-only, so the demonstration behaves exactly like a read-only account
  // and its data stays as seeded.
  const memory = new Map();
  const memoryStore = {
    get(key, fallback) {
      if (!memory.has(key)) return fallback;
      try { return JSON.parse(memory.get(key)) ?? fallback; } catch (error) { return fallback; }
    },
    set(key, value) {
      const canWrite = typeof window.KLABS_CAN_WRITE === "function" ? window.KLABS_CAN_WRITE() : window.KLABS_ACCESS_STATE?.can_write !== false;
      if (!canWrite && !seeding) {
        if (window.KLABS_ACCESS_STATE) window.KLABS_ACCESS_STATE.writeBlocked = true;
        return false;
      }
      memory.set(key, JSON.stringify(value));
      return true;
    }
  };
  let seeding = false;
  api.store = memoryStore;
  api.storeKeys = () => [...memory.keys()];

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
  }

  try {
    memoryStorageGuard(window);
    blockPersistence(window, refuse);
    blockNetwork(window, refuse);
    window.Store = memoryStore;
    window.KLABS_ACCOUNT_ID = DEMO_ACCOUNT_ID;
    verify();
    api.refused.length = 0;
    api.isolated = true;
  } catch (error) {
    api.isolated = false;
    api.failure = error && error.message ? error.message : String(error);
  }
})();
