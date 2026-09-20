// Account-level Settings sync. One Supabase row per user in public.studio_settings.
// Uses account-scoped local caches plus durable field-level pending patches. Syncs global Studio
// settings/profile data, but never the live quote sequence, transient drafts, calculators, builds or components.
(function () {
  const PENDING_PATCH_PREFIX = "klabs-studio-settings-pending";
  const ANONYMOUS_OWNER_KEY = "klabs-studio-settings-anonymous-owner";
  const SYNC_DEBOUNCE_MS = 700;

  let currentUserId = "";
  let uploadTimer = null;
  let uploadInFlight = false;
  let uploadQueuedAgain = false;
  let authGeneration = 0;

  function client() {
    return window.KLABS_SUPABASE_CLIENT;
  }
  function pendingPatchKey(userId) {
    return `${PENDING_PATCH_PREFIX}:${userId || currentUserId}`;
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
      ...source,
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
      ...source,
      businessName: String(source.businessName || "").trim(),
      contactName: String(source.contactName || "").trim(),
      email: String(source.email || "").trim(),
      phone: String(source.phone || "").trim(),
      website: String(source.website || "").trim(),
      paymentAccountName: String(source.paymentAccountName || "").trim(),
      paymentAccountNumber: String(source.paymentAccountNumber || "").trim(),
      quotePrefix: String(source.quotePrefix || "").trim(),
    };
  }
  function normalizePayload(payload) {
    const source = payload && typeof payload === "object" ? payload : {};
    return {
      ...source,
      studioSettings: normalizeStudioSettings(source.studioSettings),
      businessProfile: normalizeBusinessProfile(source.businessProfile),
    };
  }
  function withoutLiveQuoteCounter(payload) {
    const normalized = normalizePayload(payload);
    const businessProfile = { ...normalized.businessProfile };
    delete businessProfile.quoteNextNumber;
    return { ...normalized, businessProfile };
  }
  function readLocalPayload() {
    return withoutLiveQuoteCounter(window.readStudioSettingsSyncPayload ? window.readStudioSettingsSyncPayload() : {});
  }
  function readAnonymousPayload() {
    return withoutLiveQuoteCounter(window.readAnonymousStudioSettingsSyncPayload ? window.readAnonymousStudioSettingsSyncPayload() : {});
  }
  function applyLocalPayload(payload) {
    window.applyStudioSettingsSyncPayload?.(normalizePayload(payload));
  }
  function sanitizePatch(patch) {
    const source = patch && typeof patch === "object" ? patch : {};
    const next = {};
    if (source.studioSettings && typeof source.studioSettings === "object") {
      next.studioSettings = { ...source.studioSettings };
    }
    if (source.businessProfile && typeof source.businessProfile === "object") {
      next.businessProfile = { ...source.businessProfile };
      delete next.businessProfile.quoteNextNumber;
    }
    return next;
  }
  function mergePatch(basePatch, nextPatch) {
    const base = sanitizePatch(basePatch);
    const next = sanitizePatch(nextPatch);
    const merged = {};
    if (base.studioSettings || next.studioSettings) {
      merged.studioSettings = { ...(base.studioSettings || {}), ...(next.studioSettings || {}) };
    }
    if (base.businessProfile || next.businessProfile) {
      merged.businessProfile = { ...(base.businessProfile || {}), ...(next.businessProfile || {}) };
    }
    return merged;
  }
  function patchIsEmpty(patch) {
    const value = sanitizePatch(patch);
    return !Object.keys(value.studioSettings || {}).length && !Object.keys(value.businessProfile || {}).length;
  }
  function mergePayload(basePayload, patch) {
    const base = normalizePayload(basePayload);
    const changes = sanitizePatch(patch);
    return normalizePayload({
      ...base,
      studioSettings: { ...base.studioSettings, ...(changes.studioSettings || {}) },
      businessProfile: { ...base.businessProfile, ...(changes.businessProfile || {}) },
    });
  }
  function getPendingPatch(userId) {
    return sanitizePatch(window.Store.get(pendingPatchKey(userId), {}));
  }
  function setPendingPatch(userId, patch) {
    const safe = sanitizePatch(patch);
    if (patchIsEmpty(safe)) {
      window.Store.set(pendingPatchKey(userId), {});
      return;
    }
    window.Store.set(pendingPatchKey(userId), safe);
  }
  function settingsCacheState() {
    const state = window.studioSettingsSyncCacheState?.();
    return state && typeof state === "object" ? state : {};
  }
  function initialPayloadForEmptyCloud(userId) {
    const local = readLocalPayload();
    const state = settingsCacheState();
    const owner = String(window.Store.get(ANONYMOUS_OWNER_KEY, "") || "");
    const canClaimAnonymous = (!owner || owner === userId)
      && (state.hasAnonymousStudioSettings || state.hasAnonymousBusinessProfile);
    if (!canClaimAnonymous) return local;
    const anonymous = readAnonymousPayload();
    const claimed = normalizePayload({
      ...anonymous,
      studioSettings: state.hasStudioSettings ? local.studioSettings : anonymous.studioSettings,
      businessProfile: state.hasBusinessProfile ? local.businessProfile : anonymous.businessProfile,
    });
    if (!owner) window.Store.set(ANONYMOUS_OWNER_KEY, userId);
    return withoutLiveQuoteCounter(claimed);
  }
  function supabaseErrorMessage(error, fallback) {
    if (!error) return fallback;
    const parts = [error.message, error.details, error.hint, error.code ? `code ${error.code}` : ""].filter(Boolean);
    return parts.join(" - ") || fallback;
  }
  async function fetchCloudSettings(userId) {
    const { data, error } = await client().from("studio_settings").select("*").eq("user_id", userId || currentUserId).maybeSingle();
    if (error) throw new Error(supabaseErrorMessage(error, "Could not read Studio settings from Supabase."));
    return data || null;
  }
  async function upsertCloudSettings(payload, userId) {
    const row = {
      user_id: userId || currentUserId,
      payload: withoutLiveQuoteCounter(payload),
      updated_at: new Date().toISOString(),
    };
    const { error } = await client().from("studio_settings").upsert(row, { onConflict: "user_id" });
    if (error) throw new Error(supabaseErrorMessage(error, "Could not upload Studio settings to Supabase."));
  }
  async function mergeAndSync(generation, userId) {
    if (!userId || !client()) return;
    notifySyncStatus("syncing");
    const cloudRow = await fetchCloudSettings(userId);
    if (generation !== authGeneration || userId !== currentUserId) return;
    const pending = getPendingPatch(userId);
    const base = cloudRow ? normalizePayload(cloudRow.payload) : initialPayloadForEmptyCloud(userId);
    const merged = mergePayload(base, pending);
    if (!cloudRow || !patchIsEmpty(pending)) {
      await upsertCloudSettings(merged, userId);
      if (generation !== authGeneration || userId !== currentUserId) return;
    }
    const latestPending = getPendingPatch(userId);
    if (JSON.stringify(latestPending) !== JSON.stringify(pending)) {
      scheduleUpload();
      return;
    }
    setPendingPatch(userId, {});
    applyLocalPayload(merged);
    notifySyncStatus("synced");
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
    window.KLABS_UI?.onSettingsSyncStatus?.(status, detail);
  }

  async function flushUpload() {
    if (!currentUserId || !client()) return;
    if (uploadInFlight) {
      uploadQueuedAgain = true;
      return;
    }
    uploadInFlight = true;
    notifySyncStatus("syncing");
    const userId = currentUserId;
    const generation = authGeneration;
    const pending = getPendingPatch(userId);
    if (patchIsEmpty(pending)) {
      uploadInFlight = false;
      notifySyncStatus("synced");
      return;
    }
    try {
      const cloudRow = await fetchCloudSettings(userId);
      if (generation !== authGeneration || userId !== currentUserId) return;
      const base = cloudRow ? cloudRow.payload : readLocalPayload();
      const merged = mergePayload(base, pending);
      await upsertCloudSettings(merged, userId);
      if (generation !== authGeneration || userId !== currentUserId) return;
      const latestPending = getPendingPatch(userId);
      if (JSON.stringify(latestPending) === JSON.stringify(pending)) {
        setPendingPatch(userId, {});
        applyLocalPayload(merged);
      } else {
        uploadQueuedAgain = true;
      }
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
      authGeneration += 1;
      if (!currentUserId) return Promise.resolve();
      const generation = authGeneration;
      const userId = currentUserId;
      return mergeAndSync(generation, userId).catch((error) => {
        console.error("[K-Labs Studio] Settings sync error:", error);
        notifySyncStatus("error", error);
      });
    },
    notifySettingsChanged(patch) {
      if (!currentUserId) return;
      const next = mergePatch(getPendingPatch(currentUserId), patch);
      if (patchIsEmpty(next)) return;
      setPendingPatch(currentUserId, next);
      scheduleUpload();
    },
    refreshFromCloud() {
      if (!currentUserId) return Promise.resolve();
      return mergeAndSync(authGeneration, currentUserId);
    },
  };
})();
