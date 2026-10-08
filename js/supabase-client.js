window.KLABS_SUPABASE_CLIENT = window.supabase.createClient(
  window.KLABS_SUPABASE.url,
  window.KLABS_SUPABASE.publishableKey
);

async function klabsCheckLogin() {
  const { data } = await window.KLABS_SUPABASE_CLIENT.auth.getSession();
  klabsApplyAuthState(data.session);
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
  } else {
    authScreen.style.display = "";
    app.style.display = "none";
    document.body.classList.add("klabs-logged-out");
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
      if (session?.user?.id) window.KLABS_UI?.migrateComponentHierarchyLabels?.();
    })
    .catch(() => {})
    .finally(() => {
      window.KLABS_UI?.maybeSeedStarterComponents?.();
    });

  document.body.classList.remove("klabs-auth-resolving");
}

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

document.addEventListener("DOMContentLoaded", () => {
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

  klabsCheckLogin().catch(() => klabsApplyAuthState(null));
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
    await window.KLABS_SUPABASE_CLIENT.auth.signOut();
  } catch (error) {
    // Session is cleared locally below regardless of network result.
  }

  const password = document.getElementById("authPassword");
  if (password) password.value = "";

  const message = document.getElementById("authMessage");
  if (message) message.textContent = "";

  klabsApplyAuthState(null);
  window.scrollTo(0, 0);

  if (button) button.removeAttribute("aria-disabled");
}