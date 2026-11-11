(function () {
  let active = null;
  let serial = 0;
  function lockError(message) {
    const error = new Error(message);
    error.name = "StudioTabLockError";
    return error;
  }

  function release() {
    serial++;
    const previous = active;
    active = null;
    if (previous?.release) previous.release();
  }

  async function acquire(accountId) {
    if (!accountId) throw new Error("An account is required to open Studio.");
    if (active?.accountId === accountId) return active.ready;
    release();
    if (!window.navigator?.locks?.request) {
      throw lockError("This browser cannot safely coordinate Studio tabs. Update Safari before opening Studio.");
    }
    const generation = serial;
    let announce;
    const ready = new Promise((resolve, reject) => { announce = { resolve, reject }; });
    const entry = { accountId, ready, owned: false, release: null };
    active = entry;
    const request = window.navigator.locks.request(`klabs-studio-account:${accountId}`,
      { mode: "exclusive", ifAvailable: true }, async (lock) => {
        if (!lock || active !== entry || serial !== generation) {
          if (active === entry) active = null;
          announce.reject(lockError("Studio is already open for this account in another tab. Close that tab, then try again."));
          return;
        }
        entry.owned = true;
        await new Promise((resolve) => {
          entry.release = resolve;
          announce.resolve();
        });
        entry.owned = false;
      });
    request.catch((error) => {
      if (active === entry) active = null;
      announce.reject(error);
      console.error("[K-Labs Studio] Account tab lock failed:", error);
    });
    return ready;
  }

  window.KLABS_BUILD_TAB_LOCK = {
    acquire,
    release,
    owns(accountId) { return !!accountId && active?.accountId === accountId && active.owned; },
  };
  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) release();
  });
})();
