// Account-level Settings sync. One Supabase row per user in public.studio_settings.
// Keeps existing localStorage keys as the device cache/fallback; only syncs the durable global Studio
// settings/profile payload, never transient quote drafts, calculators, UI state, build ids or components.
(function () {
  const LOCAL_UPDATED_PREFIX = "klabs-studio-settings-local-updated";
  const SYNC_DEBOUNCE_MS = 700;

  let currentUserId = "";
  let uploadTimer = null;
  let uploadInFlight = false;
  let uploadQueuedAgain = false;

  function client() {
    return window.KLABS_SUPABASE_CLIENT;
  }
  function localUpdatedKey() {
    return `${LOCAL_UPDATED_PREFIX}:${currentUserId}`;
  }
  function numberOrDefault(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  function normalizeMeasurementUnits(value) {
    const next = String(value || "").trim().toLowerCase();
    return next === "imperial" ? "imperial" : "metric";
  }
  function normalizeDateFormat(value) {
    const next = String(value || "").trim().toLowerCase();
    return next === "mm/dd/yyyy" ? "mm/dd/yyyy" : "dd/mm/yyyy";
  }
  function normalizeStudioSettings(settings) {
    const source = settings && typeof settings === "object" ? settings : {};
    return {
      taxRate: Math.max(0, numberOrDefault(source.taxRate, 15) || 15),
      taxEnabled: typeof source.taxEnabled === "boolean" ? source.taxEnabled : true,
      defaultLabourRate: Math.max(0, numberOrDefault(source.defaultLabourRate, 0) || 0),
      trackComponentStock: !!source.trackComponentStock,
      measurementUnits: normalizeMeasurementUnits(source.measurementUnits),
      imperialDisplay: "decimal",
      dateFormat: normalizeDateFormat(source.dateFormat),
    };
  }
  function normalizeBusinessProfile(profile) {
    const source = profile && typeof profile === "object" ? profile : {};
    return {
      businessName: String(source.businessName || "").trim(),
      contactName: String(source.contactName || "").trim(),
      email: String(source.email || "").trim(),
      phone: String(source.phone || "").trim(),
      website: String(source.website || "").trim(),
      paymentAccountName: String(source.paymentAccountName || "").trim(),
      paymentAccountNumber: String(source.paymentAccountNumber || "").trim(),
      quotePrefix: String(source.quotePrefix || "").trim(),
      quoteNextNumber: Math.max(1, Math.round(numberOrDefault(source.quoteNextNumber, 1000)) || 1000),
    };
  }
  function normalizePayload(payload) {
    const source = payload && typeof payload === "object" ? payload : {};
    return {
      studioSettings: normalizeStudioSettings(source.studioSettings),
      businessProfile: normalizeBusinessProfile(source.businessProfile),
    };
  }
  function readLocalPayload() {
    return normalizePayload(window.readStudioSettingsSyncPayload ? window.readStudioSettingsSyncPayload() : {});
  }
  function applyLocalPayload(payload) {
    window.applyStudioSettingsSyncPayload?.(normalizePayload(payload));
  }
  function mergePayload(localPayload, cloudPayload, preferLocal) {
    const local = normalizePayload(localPayload);
    const cloud = normalizePayload(cloudPayload);
    const base = preferLocal ? local : cloud;
    const merged = normalizePayload(base);
    merged.businessProfile.quoteNextNumber = Math.max(
      local.businessProfile.quoteNextNumber,
      cloud.businessProfile.quoteNextNumber
    );
    return merged;
  }
  function payloadsEqual(left, right) {
    return JSON.stringify(normalizePayload(left)) === JSON.stringify(normalizePayload(right));
  }
  function supabaseErrorMessage(error, fallback) {
    if (!error) return fallback;
    const parts = [error.message, error.details, error.hint, error.code ? `code ${error.code}` : ""].filter(Boolean);
    return parts.join(" - ") || fallback;
  }
  async function fetchCloudSettings() {
    const { data, error } = await client().from("studio_settings").select("*").eq("user_id", currentUserId).maybeSingle();
    if (error) throw new Error(supabaseErrorMessage(error, "Could not read Studio settings from Supabase."));
    return data || null;
  }
  async function upsertCloudSettings(payload) {
    const row = {
      user_id: currentUserId,
      payload: normalizePayload(payload),
      updated_at: new Date().toISOString(),
    };
    const { error } = await client().from("studio_settings").upsert(row, { onConflict: "user_id" });
    if (error) throw new Error(supabaseErrorMessage(error, "Could not upload Studio settings to Supabase."));
  }
  async function mergeAndSync() {
    if (!currentUserId || !client()) return;
    const localPayload = readLocalPayload();
    const cloudRow = await fetchCloudSettings();
    if (!cloudRow) {
      await upsertCloudSettings(localPayload);
      window.Store.set(localUpdatedKey(), Date.now());
      return;
    }
    const cloudPayload = normalizePayload(cloudRow.payload);
    const localUpdatedAt = Number(window.Store.get(localUpdatedKey(), 0)) || 0;
    const cloudUpdatedAt = Date.parse(cloudRow.updated_at || "") || 0;
    const merged = mergePayload(localPayload, cloudPayload, localUpdatedAt > cloudUpdatedAt);
    applyLocalPayload(merged);
    if (!payloadsEqual(merged, cloudPayload)) {
      await upsertCloudSettings(merged);
    }
    window.Store.set(localUpdatedKey(), Date.now());
  }

  let syncListener = null;

  function notifySyncStatus(status, detail) {
    if (typeof syncListener === "function") {
      try {
        syncListener(status, detail);
      } catch (err) {
        console.error("[K-Labs Studio] Settings sync listener error:", err);
      }
    }
  }

  async function flushUpload() {
    if (!currentUserId || !client()) return;
    if (uploadInFlight) {
      uploadQueuedAgain = true;
      return;
    }
    uploadInFlight = true;
    notifySyncStatus("syncing");
    try {
      const localPayload = readLocalPayload();
      const cloudRow = await fetchCloudSettings();
      const merged = cloudRow ? mergePayload(localPayload, cloudRow.payload, true) : localPayload;
      applyLocalPayload(merged);
      await upsertCloudSettings(merged);
      window.Store.set(localUpdatedKey(), Date.now());
      notifySyncStatus("synced");
    } catch (error) {
      console.error("[K-Labs Studio] Settings cloud sync failed:", error);
      notifySyncStatus("error", error);
    } finally {
      uploadInFlight = false;
      if (uploadQueuedAgain) {
        uploadQueuedAgain = false;
        scheduleUpload();
      }
    }
  }
  function scheduleUpload() {
    if (!currentUserId) return;
    window.Store.set(localUpdatedKey(), Date.now());
    if (uploadTimer) clearTimeout(uploadTimer);
    uploadTimer = setTimeout(() => {
      uploadTimer = null;
      flushUpload();
    }, SYNC_DEBOUNCE_MS);
  }

  window.KLABS_SETTINGS_SYNC = {
    setSyncListener(fn) {
      syncListener = fn;
    },
    onAuthStateChanged(session) {
      const nextUserId = session?.user?.id || "";
      if (uploadTimer) {
        clearTimeout(uploadTimer);
        uploadTimer = null;
      }
      uploadInFlight = false;
      uploadQueuedAgain = false;
      currentUserId = nextUserId;
      if (!currentUserId) return Promise.resolve();
      return mergeAndSync().catch((error) => {
        console.error("[K-Labs Studio] Settings sync error:", error);
      });
    },
    notifySettingsChanged() {
      scheduleUpload();
    },
  };
})();
