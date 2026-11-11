(function () {
  const accountKeys = [
    "klabs-workshop-builds", "klabs-workshop-quotes", "klabs-workshop-quote-current",
    "klabs-workshop-component-library", "klabs-workshop-component-taxonomy",
    "klabs-business-profile", "klabs-studio-settings", "klabs-studio-settings-pending",
    "klabs-component-cloud-known-ids", "klabs-component-cloud-known-updated",
    "klabs-component-cloud-known-taxonomy", "klabs-component-cloud-linked",
    "klabs-build-sync-journal"
  ];
  const sharedKeys = [
    "klabs-workshop-builds", "klabs-workshop-quotes", "klabs-workshop-quote-current",
    "klabs-workshop-component-library", "klabs-workshop-component-taxonomy",
    "klabs-workshop-custom-suppliers", "klabs-workshop-archived-categories",
    "klabs-workshop-archived-suppliers", "klabs-business-profile", "klabs-studio-settings",
    "klabs-studio-state", "klabs-blank-library", "klabs-blank-favourites",
    "klabs-blank-favorites", "klabs-build-seq"
  ];

  function capture(storage, account, draft) {
    if (!account || !account.id || !account.email) {
      throw new Error("The signed-in account could not be identified. No export was created.");
    }
    const readKeys = (keys, suffix) => {
      const values = {};
      for (const base of keys) {
        const key = base + suffix;
        const value = storage.getItem(key);
        if (value !== null) values[key] = value;
      }
      return values;
    };
    return {
      format: "klabs-studio-local-recovery-v1",
      capturedAt: new Date().toISOString(),
      account: { id: account.id, email: account.email },
      accountLocalStorage: readKeys(accountKeys, ":" + account.id),
      unassignedSharedLocalStorage: readKeys(sharedKeys, ""),
      signedOutLocalStorage: readKeys(accountKeys, ":local"),
      liveDraft: draft,
      limitations: [
        "Local data only; cloud data and other accounts' scoped data are not included.",
        "Shared unassigned data may belong to another account. Do not assign or import it without review.",
        "Unsaved form input, IndexedDB and service-worker storage are not included.",
        "v208's in-memory pending deletion intentions cannot be reconstructed from local storage.",
        "This file is not encrypted. Store it securely."
      ]
    };
  }

  function download() {
    const status = document.getElementById("studioRecoveryStatus");
    try {
      const account = window.KLABS_RECOVERY_ACCOUNT;
      const draft = window.KLABS_UI?.readRecoveryDraft?.();
      if (!draft) throw new Error("The current Studio draft is unavailable. No export was created.");
      const snapshot = capture(window.localStorage, account, draft);
      const text = JSON.stringify(snapshot, null, 2);
      const file = new Blob([text], { type: "application/json" });
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = `klabs-studio-recovery-${account.id}-${snapshot.capturedAt.slice(0, 10)}.json`;
      link.hidden = true;
      document.body.appendChild(link);
      try {
        link.click();
      } finally {
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
      status.textContent = "Export requested. Check Downloads or Files and keep the unencrypted file private.";
    } catch (error) {
      console.error("[K-Labs Studio] Recovery export failed:", error);
      status.textContent = `Export failed: ${error.message || "Could not read local data."}`;
    }
  }

  window.KLABS_STUDIO_RECOVERY = { capture, download };
  document.getElementById("studioRecoveryExportBtn")?.addEventListener("click", download);
})();
