window.KLABS_SUPABASE_CLIENT = window.supabase.createClient(
  window.KLABS_SUPABASE.url,
  window.KLABS_SUPABASE.publishableKey
);
let klabsReadOnlyObserver = null;

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

async function klabsCheckLogin() {
  const { data, error } = await window.KLABS_SUPABASE_CLIENT.auth.getSession();
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
      notice.hidden = !readOnly;
      const noticeText = notice.querySelector("span");
      if (noticeText) {
        noticeText.textContent = window.KLABS_ACCESS_STATE?.offline
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

  const syncOutcome = window.KLABS_SYNC?.onAuthStateChanged?.(session);
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
    if (!/\b(add|new|save|delete|remove|duplicate|edit|update|confirm|complete|mark|record|send|email|print|export|import|rename|copy|reset|clear|create|quote|price)\b/i.test(label)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const notice = document.getElementById("readOnlyAccessNotice");
    if (notice) notice.querySelector("span").textContent = "This account is read-only. You can view your records, but cannot edit, save, or create customer documents.";
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

  klabsCheckLogin().catch((error) => {
    console.error("[K-Labs Studio] Could not restore the session:", error);
    if (window.KLABS_PUBLIC_ENTRY && !window.KLABS_UI) {
      window.KLABS_PUBLIC_ENTRY.showHome();
      document.getElementById("authMessage").textContent = "Could not restore your session. Check your connection and try again.";
    } else if (window.KLABS_PUBLIC_ENTRY) {
      document.getElementById("authMessage").textContent = "Could not open Studio. Reload and try again.";
    } else {
      klabsApplyAuthState(null);
    }
  });
  window.KLABS_SUPABASE_CLIENT.auth.onAuthStateChange?.((event, session) => {
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