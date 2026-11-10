// Supabase sync for klabs-workshop-builds ONLY. Independent from js/component-sync.js (Components/taxonomy)
// and does not touch the legacy klabs-workshop-quotes store. One Build record = one authoritative record,
// identified by its own stable `id` field (NOT buildNumber, which is a per-device sequential display label
// only - see js/ui.js nextBuildNumber()). Customer-only profiles use the same payload path with
// recordType="customer"; the UI includes them in Customer Finder identity/profile data but excludes them
// from build and quote histories.
(function () {
  let currentUserId = "";
  let authGeneration = 0;
  let pushTimer = null;
  let pushInFlight = false;
  let pushQueuedAgain = false;
  let localMutationVersion = 0;
  // Per-record queues flushed together on the next debounced push - keeps "on save, upsert that ONE
  // record" literal: we never re-scan/re-upload the whole local array on an ordinary edit.
  let pendingUpsertById = new Map();
  let pendingDeleteIds = new Set();

  function client() {
    return window.KLABS_SUPABASE_CLIENT;
  }
  function canWrite() {
    return typeof window.KLABS_CAN_WRITE === "function"
      ? window.KLABS_CAN_WRITE()
      : window.KLABS_ACCESS_STATE?.can_write !== false;
  }
  function supabaseErrorMessage(error, fallback) {
    if (!error) return fallback;
    const parts = [error.message, error.details, error.hint, error.code ? `code ${error.code}` : ""].filter(Boolean);
    return parts.join(" — ") || fallback;
  }
  function localBuilds() {
    const records = window.savedBuildRecords ? window.savedBuildRecords() : [];
    return Array.isArray(records) ? records.filter((record) => record && record.id) : [];
  }
  function saveLocalBuilds(records) {
    window.saveBuildRecords?.(records);
  }

  // payload is the FULL existing build record as-is (every field newQuoteTemplate()/normalizeQuote()
  // already produces) - keeps this mapper simple (one jsonb column) instead of hand-mapping ~40 fields.
  function recordToRow(record, userId) {
    return {
      user_id: userId,
      client_id: String(record.id || ""),
      build_number: String(record.buildNumber || ""),
      payload: record,
      updated_at: record.updatedAt || record.savedAt || new Date().toISOString(),
    };
  }
  function rowToRecord(row) {
    const payload = row && row.payload && typeof row.payload === "object" ? row.payload : {};
    return { ...payload, id: String(row.client_id || payload.id || ""), buildNumber: String(payload.buildNumber || row.build_number || "") };
  }

  function isCurrent(context) {
    return context.generation === authGeneration && context.userId === currentUserId;
  }
  async function fetchCloudBuilds(context) {
    const { data, error } = await client().from("builds").select("*").eq("user_id", context.userId);
    if (error) throw new Error(supabaseErrorMessage(error, "Could not read your builds from Supabase."));
    return Array.isArray(data) ? data : [];
  }
  async function upsertCloudBuilds(records, context) {
    if (!canWrite()) throw new Error("This account is read-only; builds cannot be synced.");
    if (!records.length || !isCurrent(context)) return;
    const byId = new Map();
    records.forEach((record) => { byId.set(String(record.id || ""), record); });
    const rows = Array.from(byId.values()).filter((record) => record.id).map((record) => recordToRow(record, context.userId));
    if (!rows.length) return;
    const { error } = await client().from("builds").upsert(rows, { onConflict: "user_id,client_id" });
    if (error) throw new Error(supabaseErrorMessage(error, "Could not upload your build to Supabase."));
  }
  async function deleteCloudBuilds(ids, context) {
    if (!canWrite()) throw new Error("This account is read-only; builds cannot be deleted.");
    const list = ids.filter(Boolean);
    if (!list.length || !isCurrent(context)) return;
    const { error } = await client().from("builds").delete().eq("user_id", context.userId).in("client_id", list);
    if (error) throw new Error(supabaseErrorMessage(error, "Could not delete build from Supabase."));
  }

  // Sign-in/startup merge: union of local + cloud by stable id. On a per-id conflict, whichever side's own
  // updatedAt/updated_at is newer wins - never a silent full overwrite either way. Nothing local-only is
  // ever dropped (satisfies "do not delete local records during first migration").
  async function mergeAndSync(context) {
    const cloudRows = await fetchCloudBuilds(context);
    if (!isCurrent(context)) return;
    const cloudById = new Map(cloudRows.map((row) => [String(row.client_id), row]));
    const snapshotVersion = localMutationVersion;
    const local = localBuilds();
    const seen = new Set();
    const merged = [];
    const toUpsert = [];

    local.forEach((record) => {
      const id = String(record.id);
      seen.add(id);
      const row = cloudById.get(id);
      if (!row) { merged.push(record); toUpsert.push(record); return; }
      const localTs = Date.parse(record.updatedAt || record.savedAt || "") || 0;
      const cloudTs = Date.parse(row.updated_at || "") || 0;
      if (localTs >= cloudTs) { merged.push(record); toUpsert.push(record); }
      else { merged.push(rowToRecord(row)); }
    });
    cloudRows.forEach((row) => {
      const id = String(row.client_id);
      if (seen.has(id)) return;
      merged.push(rowToRecord(row));
    });

    if (canWrite() && toUpsert.length) await upsertCloudBuilds(toUpsert, context);
    if (!isCurrent(context)) return;
    // A save/delete may land while the sign-in merge is awaiting cloud I/O. Never replace that newer local
    // state with this merge's stale snapshot; restart against the latest local records instead.
    if (localMutationVersion !== snapshotVersion) return mergeAndSync(context);
    const previousHydration = window.KLABS_SYNC_HYDRATION;
    if (!canWrite()) window.KLABS_SYNC_HYDRATION = true;
    try {
      saveLocalBuilds(merged);
    } finally {
      window.KLABS_SYNC_HYDRATION = previousHydration;
    }
    window.KLABS_UI?.refreshBuildViews?.();
  }

  function scheduleFlush() {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => { pushTimer = null; flushPending(); }, 700);
  }

  // Ongoing sync: upserts/deletes only the specific records queued by notifyBuildSaved/notifyBuildDeleted -
  // never re-uploads the whole local array.
  async function flushPending() {
    if (!canWrite()) {
      pendingUpsertById = new Map();
      pendingDeleteIds = new Set();
      return;
    }
    if (pushInFlight) { pushQueuedAgain = true; return; }
    const context = { userId: currentUserId, generation: authGeneration };
    const toUpsert = Array.from(pendingUpsertById.values());
    const toDelete = Array.from(pendingDeleteIds);
    pendingUpsertById = new Map();
    pendingDeleteIds = new Set();
    if (!toUpsert.length && !toDelete.length) return;
    pushInFlight = true;
    try {
      if (toDelete.length) await deleteCloudBuilds(toDelete, context);
      if (toUpsert.length && isCurrent(context)) await upsertCloudBuilds(toUpsert, context);
    } catch (error) {
      console.error("[K-Labs Studio] Build cloud sync failed:", error);
      // Re-queue so the next successful attempt (next save, or a later retry) still carries this change.
      if (isCurrent(context)) {
        toUpsert.forEach((record) => pendingUpsertById.set(String(record.id), record));
        toDelete.forEach((id) => pendingDeleteIds.add(id));
      }
    } finally {
      pushInFlight = false;
      if (pushQueuedAgain) { pushQueuedAgain = false; scheduleFlush(); }
    }
  }

  window.KLABS_BUILD_SYNC = {
    onAuthStateChanged(session) {
      const nextUserId = session?.user?.id || "";
      if (nextUserId && nextUserId === currentUserId) {
        return mergeAndSync({ userId: currentUserId, generation: authGeneration }).catch((error) => {
          console.error("[K-Labs Studio] Build library sync error:", error);
        });
      }
      if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
      pendingUpsertById = new Map();
      pendingDeleteIds = new Set();
      currentUserId = nextUserId;
      authGeneration += 1;
      if (!currentUserId) return Promise.resolve();
      const context = { userId: currentUserId, generation: authGeneration };
      return mergeAndSync(context).catch((error) => {
        console.error("[K-Labs Studio] Build library sync error:", error);
      });
    },
    // Queues exactly the one changed record - id is that record's own stable id (see js/ui.js persistBuildRecord).
    notifyBuildSaved(record) {
      if (!canWrite() || !currentUserId || !record || !record.id) return;
      localMutationVersion += 1;
      pendingDeleteIds.delete(String(record.id));
      pendingUpsertById.set(String(record.id), record);
      scheduleFlush();
    },
    notifyBuildDeleted(id) {
      if (!canWrite() || !currentUserId || !id) return;
      localMutationVersion += 1;
      pendingUpsertById.delete(String(id));
      pendingDeleteIds.add(String(id));
      scheduleFlush();
    },
  };
})();
