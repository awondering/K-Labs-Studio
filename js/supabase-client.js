// Q17: supabase-js renews an expired sign-in with no time limit of its own. Only that renewal request is bounded
// (10 s, inside Supabase's refresh-token reuse window, so a slow answer is not mistaken for a reused token); every
// other request passes straight through unchanged.
const KLABS_RENEWAL_REQUEST_TIMEOUT_MS = 10000;
function klabsFetch(input, init) {
  const url = typeof input === "string" ? input : input?.url || "";
  if (!/\/auth\/v1\/token\?(?:.*&)?grant_type=refresh_token(?:&|$)/.test(url) || typeof AbortController !== "function") {
    return window.fetch(input, init);
  }
  const controller = new AbortController();
  const outer = init?.signal;
  if (outer) {
    if (outer.aborted) controller.abort();
    else outer.addEventListener("abort", () => controller.abort(), { once: true });
  }
  const timer = window.setTimeout(() => controller.abort(), KLABS_RENEWAL_REQUEST_TIMEOUT_MS);
  return window.fetch(input, { ...(init || {}), signal: controller.signal })
    .finally(() => window.clearTimeout(timer));
}
// Q18: a Demo Mode page never creates a Supabase client, so it holds no session and makes no Supabase requests.
window.KLABS_SUPABASE_CLIENT = window.KLABS_DEMO?.active ? null : window.supabase.createClient(
  window.KLABS_SUPABASE.url,
  window.KLABS_SUPABASE.publishableKey,
  { global: { fetch: klabsFetch } }
);
let klabsReadOnlyObserver = null;
let klabsDemoMessageTimer = null;

function klabsApplyReadOnlyControls() {
  const readOnly = window.KLABS_ACCESS_STATE?.can_write === false;
  const app = document.getElementById("app");
  if (!app) return;
  if (!readOnly) {
    if (klabsReadOnlyObserver) klabsReadOnlyObserver.disconnect();
    klabsReadOnlyObserver = null;
    app.querySelectorAll("[data-klabs-readonly]").forEach((control) => {
      control.removeAttribute("data-klabs-readonly");
      control.disabled = false;
      control.readOnly = false;
    });
    return;
  }
  app.querySelectorAll("input, textarea, select").forEach((control) => {
    if (control.type === "search") return;
    control.setAttribute("data-klabs-readonly", "true");
    if (control.tagName === "INPUT" && ["text", "email", "tel", "url", "number", "date", "time", "datetime-local", "month", "week"].includes(control.type)) {
      control.readOnly = true;
    } else {
      control.disabled = true;
    }
  });
  if (!klabsReadOnlyObserver && typeof MutationObserver === "function") {
    klabsReadOnlyObserver = new MutationObserver(klabsApplyReadOnlyControls);
    klabsReadOnlyObserver.observe(app, { childList: true, subtree: true });
  }
}

// Q17: how long a launch waits for an expired sign-in to be renewed before opening the saved records view-only.
const KLABS_SESSION_RENEWAL_WAIT_MS = 3000;
// supabase-js renews a stored session this close to (or past) its expiry before returning it.
const KLABS_SESSION_RENEWAL_MARGIN_MS = 90 * 1000;

// The signed-in account stored on this device, only when its session needs renewal now. Holds the account id and
// email only - never the tokens, so nothing built from it can be used against the server.
function klabsStoredSessionNeedingRenewal() {
  try {
    const key = window.KLABS_SUPABASE_CLIENT?.auth?.storageKey;
    if (typeof key !== "string" || !key) return null;
    const stored = JSON.parse(window.localStorage.getItem(key) || "null");
    const id = stored?.user?.id;
    if (typeof id !== "string" || !id || typeof stored.refresh_token !== "string" || !stored.refresh_token
      || typeof stored.access_token !== "string" || !Number.isFinite(stored.expires_at)) return null;
    if (stored.expires_at * 1000 - Date.now() >= KLABS_SESSION_RENEWAL_MARGIN_MS) return null;
    return { user: { id, email: typeof stored.user.email === "string" ? stored.user.email : "" } };
  } catch (error) {
    return null;
  }
}

// supabase-js marks "could not reach the server" (failed or aborted fetch, 5xx) as AuthRetryableFetchError. Every
// other renewal failure (revoked or invalid refresh token, 4xx) is a real rejection and is never treated as offline.
function klabsIsRenewalNetworkFailure(error) {
  return error?.name === "AuthRetryableFetchError";
}
window.KLABS_IS_RENEWAL_NETWORK_FAILURE = klabsIsRenewalNetworkFailure;

async function klabsCheckLogin() {
  const pending = window.KLABS_PUBLIC_ENTRY?.applyOfflineSession ? klabsStoredSessionNeedingRenewal() : null;
  const request = window.KLABS_SUPABASE_CLIENT.auth.getSession();
  let outcome;
  if (pending) {
    let timer = null;
    outcome = await Promise.race([
      request,
      new Promise((resolve) => { timer = window.setTimeout(() => resolve({ renewalTimedOut: true }), KLABS_SESSION_RENEWAL_WAIT_MS); })
    ]);
    window.clearTimeout(timer);
    if (outcome?.renewalTimedOut || (!outcome?.data?.session && klabsIsRenewalNetworkFailure(outcome?.error))) {
      await window.KLABS_PUBLIC_ENTRY.applyOfflineSession(pending, klabsApplyAuthState, request);
      return;
    }
  } else {
    outcome = await request;
  }
  const { data, error } = outcome;
  if (error) throw error;
  if (window.KLABS_PUBLIC_ENTRY) {
    await window.KLABS_PUBLIC_ENTRY.applySession(data.session, klabsApplyAuthState);
  } else {
    klabsApplyAuthState(data.session);
  }
}

function klabsApplyAuthState(session) {
  const authScreen = document.getElementById("authScreen");
  const app = document.getElementById("app");
  const accountEmail = document.getElementById("settingsAccountEmail");
  window.KLABS_RECOVERY_ACCOUNT = session?.user?.id && session.user.email
    ? { id: String(session.user.id), email: String(session.user.email) } : null;

  // Account-scoped local settings (e.g. business profile) key off this id.
  const nextAccountId = session?.user?.id || "";
  if (window.KLABS_ACCOUNT_ID !== nextAccountId) {
    window.KLABS_ACCOUNT_ID = nextAccountId;
    window.KLABS_UI?.onAccountChange?.();
  }

  if (session) {
    authScreen.style.display = "none";
    app.style.display = "";
    document.body.classList.remove("klabs-logged-out");
    if (accountEmail) accountEmail.textContent = session.user?.email || "Signed in";
    const readOnly = window.KLABS_ACCESS_STATE?.can_write === false;
    document.body.classList.toggle("klabs-read-only", readOnly);
    const notice = document.getElementById("readOnlyAccessNotice");
    if (notice) {
      // Q18: Demo Mode is identified by its own bar instead.
      notice.hidden = !readOnly || !!window.KLABS_ACCESS_STATE?.demo;
      const noticeText = notice.querySelector("span");
      if (noticeText) {
        noticeText.textContent = window.KLABS_ACCESS_STATE?.offline_session
          ? "You are offline and your sign-in could not be renewed. Your saved records are view-only until you reconnect."
          : window.KLABS_ACCESS_STATE?.offline
          ? "You are offline and account access could not be verified. Your saved records are view-only until you reconnect."
          : "Your trial has ended. Your records remain available, but changes cannot be saved.";
      }
    }
    klabsApplyReadOnlyControls();
  } else {
    authScreen.style.display = "";
    app.style.display = "none";
    document.body.classList.add("klabs-logged-out");
    document.body.classList.remove("klabs-read-only");
    const notice = document.getElementById("readOnlyAccessNotice");
    if (notice) notice.hidden = true;
    if (accountEmail) accountEmail.textContent = "Signed out";
  }

  // Q17: a view-only launch whose sign-in could not be renewed makes no Supabase calls - no sync, no owner check -
  // until the page reloads with a renewed session.
  if (session && window.KLABS_ACCESS_STATE?.offline_session) {
    document.body.classList.remove("klabs-auth-resolving");
    return;
  }
  const syncOutcome = window.KLABS_SYNC?.onAuthStateChanged?.(session);
  Promise.resolve(window.KLABS_ADMIN_ACCESS?.onAuthStateChanged?.(session)).catch((error) => {
    console.error("[K-Labs Studio] Owner access check failed:", error);
  });
  // Build sync is independent of Component sync above - failures/timing in one must never block the other.
  Promise.resolve(window.KLABS_BUILD_SYNC?.onAuthStateChanged?.(session)).catch((error) => {
    console.error("[K-Labs Studio] Build library sync error:", error);
  });
  Promise.resolve(window.KLABS_SETTINGS_SYNC?.onAuthStateChanged?.(session)).catch((error) => {
    console.error("[K-Labs Studio] Settings sync error:", error);
  });
  // First-run starter seeding must wait until any merge/sync has fully settled, so seeded defaults can
  // never be mistaken for pre-existing local data during a sign-in merge.
  Promise.resolve(syncOutcome)
    .then(() => {
      if (session?.user?.id && window.KLABS_ACCESS_STATE?.can_write !== false) {
        window.KLABS_UI?.migrateComponentHierarchyLabels?.();
      }
    })
    .catch(() => {})
    .finally(() => {
      if (window.KLABS_ACCESS_STATE?.can_write !== false) {
        window.KLABS_UI?.maybeSeedStarterComponents?.();
      }
    });

  document.body.classList.remove("klabs-auth-resolving");
}
window.KLABS_APPLY_AUTH_STATE = klabsApplyAuthState;

let klabsSignInPending = false;

async function klabsSignIn() {
  if (klabsSignInPending) return;
  klabsSignInPending = true;

  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword").value;
  const message = document.getElementById("authMessage");
  const button = document.getElementById("authSignIn");

  message.textContent = "Signing in...";
  if (button) {
    button.setAttribute("aria-disabled", "true");
    button.setAttribute("aria-busy", "true");
  }

  try {
    const { error } = await window.KLABS_SUPABASE_CLIENT.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      message.textContent = error.message;
      return;
    }

    message.textContent = "";
    await klabsCheckLogin();
  } catch (error) {
    message.textContent = error?.message || "Sign in failed. Please try again.";
  } finally {
    klabsSignInPending = false;
    if (button) {
      button.removeAttribute("aria-disabled");
      button.removeAttribute("aria-busy");
    }
  }
}
async function klabsForgotPassword() {
  const email = document.getElementById("authEmail").value.trim();
  const message = document.getElementById("authMessage");

  if (!email) {
    message.textContent = "Enter your email address first.";
    return;
  }

  message.textContent = "Sending password reset email...";

  const { error } =
    await window.KLABS_SUPABASE_CLIENT.auth.resetPasswordForEmail(email);

  if (error) {
    message.textContent = error.message;
    return;
  }

  message.textContent = "Password reset email sent.";
}

let klabsSignUpPending = false;

function klabsShowAuthMode(mode) {
  const signUp = mode === "signup";
  document.getElementById("authForm").hidden = signUp;
  document.getElementById("authShowSignUp").hidden = signUp;
  document.getElementById("authSignUpForm").hidden = !signUp;
  document.getElementById("authMessage").textContent = "";
}

async function klabsSignUp() {
  if (klabsSignUpPending) return;

  const email = document.getElementById("signUpEmail").value.trim();
  const password = document.getElementById("signUpPassword").value;
  const confirm = document.getElementById("signUpConfirm").value;
  const message = document.getElementById("authMessage");
  const button = document.getElementById("authSignUp");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    message.textContent = "Enter a valid email address.";
    return;
  }
  if (password.length < 6) {
    message.textContent = "Password must be at least 6 characters.";
    return;
  }
  if (password !== confirm) {
    message.textContent = "Passwords do not match.";
    return;
  }

  klabsSignUpPending = true;
  message.textContent = "Creating account...";
  button.setAttribute("aria-disabled", "true");
  button.setAttribute("aria-busy", "true");

  try {
    const options = /^https?:$/.test(window.location.protocol)
      ? { emailRedirectTo: window.location.origin + window.location.pathname.replace(/index\.html$/, "") }
      : undefined;
    const { data, error } = await window.KLABS_SUPABASE_CLIENT.auth.signUp({ email, password, options });

    if (error) {
      message.textContent = error.message;
      return;
    }

    document.getElementById("signUpPassword").value = "";
    document.getElementById("signUpConfirm").value = "";

    if (data?.session) {
      message.textContent = "";
      await klabsCheckLogin();
    } else {
      // Also covers Supabase's obfuscated duplicate (user with empty identities): never reveal whether the email exists.
      message.textContent = "Check your email (" + email + ") for a verification link. " +
        "Your account is not verified until you open it. If you already have an account, sign in or use Forgot password.";
    }
  } catch (error) {
    message.textContent = error?.message || "Could not create account. Check your connection and try again.";
  } finally {
    klabsSignUpPending = false;
    button.removeAttribute("aria-disabled");
    button.removeAttribute("aria-busy");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.addEventListener("click", (event) => {
    if (!document.body.classList.contains("klabs-read-only")) return;
    const control = event.target.closest("#app button, #app [role='button'], #app input[type='submit']");
    if (!control || control.matches("[data-nav], [data-collapsible-trigger], [data-builds-status-filter]")) return;
    const label = `${control.textContent || ""} ${control.getAttribute("aria-label") || ""} ${control.id || ""}`;
    // Q17: with an unrenewed sign-in no customer document can be produced either (invoices, statements, PDFs).
    const offlineSession = document.body.classList.contains("klabs-offline-session");
    // Q18: Demo Mode blocks the same documents, plus account, sign-out, sync, recovery and administration controls.
    const demo = !!window.KLABS_ACCESS_STATE?.demo;
    const blockedOffline = (offlineSession || demo) && (
      control.closest(".workshop-build-actions-surface, [data-current-build-action], [data-more-document], #currentBuildActionsMenu")
      || /\b(invoice|statement|documents?|pdf|share|download|issue|payment|deposit|generate|template)\b/i.test(label));
    const blockedDemo = demo && (
      control.closest("#settingsAccountCard, #settingsRecoveryCard, #settingsAdminEntry, #adminAccessScreen, #buildSyncNotice")
      || control.matches(".layout-control-card__button, .component-quantity__step, [data-spiral-angle-action]")
      || /\b(log ?out|sign ?out|sync|admin|upload|logo|increase|decrease)\b/i.test(label));
    if (!blockedOffline && !blockedDemo && !/\b(add|new|save|delete|remove|duplicate|edit|update|confirm|complete|mark|record|send|email|print|export|import|rename|copy|reset|clear|create|quote|price)\b/i.test(label)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (demo) {
      const bar = document.getElementById("demoModeMessage");
      if (bar) {
        const resting = "Fictional data. Nothing here is saved, sent or synced.";
        bar.textContent = "Editing, saving and customer documents are not available in the demonstration.";
        window.clearTimeout(klabsDemoMessageTimer);
        klabsDemoMessageTimer = window.setTimeout(() => { bar.textContent = resting; }, 4000);
      }
      return;
    }
    const notice = document.getElementById("readOnlyAccessNotice");
    if (notice) notice.querySelector("span").textContent = offlineSession
      ? "You are offline and your sign-in could not be renewed. You can view your saved records, but cannot edit, save, or create customer documents until you reconnect."
      : "This account is read-only. You can view your records, but cannot edit, save, or create customer documents.";
  }, true);
  // Q18: step (+/-) controls act on press-and-hold (pointerdown), before any click; in Demo Mode they never start.
  document.addEventListener("pointerdown", (event) => {
    if (!window.KLABS_ACCESS_STATE?.demo) return;
    if (!event.target.closest?.("#app .layout-control-card__button, #app .component-quantity__step, #app [data-spiral-angle-action]")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  document.addEventListener("submit", (event) => {
    if (!document.body.classList.contains("klabs-read-only") || !event.target.closest("#app")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  document.getElementById("authShowSignUp")
    ?.addEventListener("click", () => klabsShowAuthMode("signup"));
  document.getElementById("authShowSignIn")
    ?.addEventListener("click", () => klabsShowAuthMode("signin"));
  document.getElementById("authSignUpForm")
    ?.addEventListener("submit", (event) => {
      event.preventDefault();
      klabsSignUp();
    });

  // Enter in either field and the Sign In button both submit this form natively.
  document.getElementById("authForm")
    ?.addEventListener("submit", (event) => {
      event.preventDefault();
      klabsSignIn();
    });

  document.getElementById("authForgotPassword")
    ?.addEventListener("click", klabsForgotPassword);

  document.getElementById("settingsSignOut")
    ?.addEventListener("click", klabsSignOut);

  // Q18: a Demo Mode page opens the demonstration instead of restoring a sign-in.
  if (window.KLABS_DEMO?.active) {
    window.KLABS_PUBLIC_ENTRY?.startDemo(klabsApplyAuthState);
    return;
  }
  klabsCheckLogin().catch((error) => {
    console.error("[K-Labs Studio] Could not restore the session:", error);
    if (error.name === "StudioTabLockError") {
      document.getElementById("authMessage").textContent = error.message;
    } else if (window.KLABS_PUBLIC_ENTRY && !window.KLABS_UI) {
      window.KLABS_PUBLIC_ENTRY.showHome();
      document.getElementById("authMessage").textContent = "Could not restore your session. Check your connection and try again.";
    } else if (window.KLABS_PUBLIC_ENTRY) {
      document.getElementById("authMessage").textContent = "Could not open Studio. Reload and try again.";
    } else {
      klabsApplyAuthState(null);
    }
  });
  window.KLABS_SUPABASE_CLIENT.auth.onAuthStateChange?.((event, session) => {
    // Q17: the sign-in was renewed (or ended) while the saved records were open view-only - restart normally.
    if (window.KLABS_ACCESS_STATE?.offline_session && (session?.user?.id || event === "SIGNED_OUT")) {
      window.location.reload();
      return;
    }
    if (!window.KLABS_UI && !window.KLABS_PUBLIC_ENTRY?.isLoading()) return;
    if (event === "SIGNED_OUT" || (window.KLABS_ACCOUNT_ID && session?.user?.id && session.user.id !== window.KLABS_ACCOUNT_ID)) {
      window.location.reload();
    }
  });
});
document.getElementById("authTogglePassword")
  ?.addEventListener("click", () => {
    const password = document.getElementById("authPassword");
    const isHidden = password.type === "password";

    password.type = isHidden ? "text" : "password";

    document.getElementById("authTogglePassword")
      ?.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
  });
  async function klabsSignOut() {
  const button = document.getElementById("settingsSignOut");
  if (button) button.setAttribute("aria-disabled", "true");

  try {
    const { error } = await window.KLABS_SUPABASE_CLIENT.auth.signOut();
    if (error) throw error;
  } catch (error) {
    console.error("[K-Labs Studio] Sign out failed:", error);
    window.alert("Could not sign out. Please check your connection and try again.");
    if (button) button.removeAttribute("aria-disabled");
    return;
  }

  if (window.KLABS_PUBLIC_ENTRY) {
    window.location.reload();
    return;
  }

  const password = document.getElementById("authPassword");
  if (password) password.value = "";

  const message = document.getElementById("authMessage");
  if (message) message.textContent = "";
  if (document.getElementById("authSignUpForm")) klabsShowAuthMode("signin");

  klabsApplyAuthState(null);
  window.scrollTo(0, 0);

  if (button) button.removeAttribute("aria-disabled");
}