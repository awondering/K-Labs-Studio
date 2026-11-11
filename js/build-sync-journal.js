(function () {
  // Journal writes require the account-wide tab lock held by the sync client.
  const prefix = "klabs-build-sync-journal:";

  function empty() {
    return { version: 1, baselines: {}, pending: {}, conflicts: {}, archive: [] };
  }

  function read(accountId) {
    if (!accountId) throw new Error("An account is required for build sync storage.");
    const raw = window.localStorage.getItem(prefix + accountId);
    if (raw === null) return empty();
    const value = JSON.parse(raw);
    if (!value || value.version !== 1 || !value.baselines || !value.pending ||
        !value.conflicts || !Array.isArray(value.archive)) {
      throw new Error("Build sync storage is invalid. No changes were uploaded.");
    }
    return value;
  }

  function write(accountId, value) {
    if (!accountId) throw new Error("An account is required for build sync storage.");
    window.localStorage.setItem(prefix + accountId, JSON.stringify(value));
  }

  window.KLABS_BUILD_SYNC_JOURNAL = { read, write };
})();
