// Supabase sync for klabs-workshop-builds ONLY. Independent from js/component-sync.js (Components/taxonomy)
// and does not touch the legacy klabs-workshop-quotes store. One Build record = one authoritative record,
// identified by its own stable `id` field (NOT buildNumber, which is a per-device sequential display label
// only - see js/ui.js nextBuildNumber()). Customers are never stored/synced here: they remain a pure
// derived view over Build/Quote records (js/ui.js customerSavedGroups()/allSavedEntries()), so once Builds
// match on both devices the Customer list matches automatically with no changes to that code.
(function () {
  let currentUserId = "";
  let pushTimer = null;
  let pushInFlight = false;
  let pushQueuedAgain = false;
  // Per-record queues flushed together on the next debounced push - keeps "on save, upsert that ONE
  // record" literal: we never re-scan/re-upload the whole local array on an ordinary edit.
  let pendingUpsertById = new Map();
  let pendingDeleteIds = new Set();

  function client() {
    return window.KLABS_SUPABASE_CLIENT;
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
  function recordToRow(record) {
    return {
      user_id: currentUserId,
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

  async function fetchCloudBuilds() {
    const { data, error } = await client().from("builds").select("*").eq("user_id", currentUserId);
    if (error) throw new Error(supabaseErrorMessage(error, "Could not read your builds from Supabase."));
    return Array.isArray(data) ? data : [];
  }
  async function upsertCloudBuilds(records) {
    if (!records.length) return;
    const byId = new Map();
    records.forEach((record) => { byId.set(String(record.id || ""), record); });
    const rows = Array.from(byId.values()).filter((record) => record.id).map(recordToRow);
    if (!rows.length) return;
    const { error } = await client().from("builds").upsert(rows, { onConflict: "user_id,client_id" });
    if (error) throw new Error(supabaseErrorMessage(error, "Could not upload your build to Supabase."));
  }
  async function deleteCloudBuilds(ids) {
    const list = ids.filter(Boolean);
    if (!list.length) return;
    const { error } = await client().from("builds").delete().eq("user_id", currentUserId).in("client_id", list);
    if (error) throw new Error(supabaseErrorMessage(error, "Could not delete build from Supabase."));
  }

  // Sign-in/startup merge: union of local + cloud by stable id. On a per-id conflict, whichever side's own
  // updatedAt/updated_at is newer wins - never a silent full overwrite either way. Nothing local-only is
  // ever dropped (satisfies "do not delete local records during first migration").
  async function mergeAndSync() {
    const cloudRows = await fetchCloudBuilds();
    const cloudById = new Map(cloudRows.map((row) => [String(row.client_id), row]));
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

    if (toUpsert.length) await upsertCloudBuilds(toUpsert);
    saveLocalBuilds(merged);
    window.KLABS_UI?.refreshBuildViews?.();
  }

  function scheduleFlush() {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => { pushTimer = null; flushPending(); }, 700);
  }

  // Ongoing sync: upserts/deletes only the specific records queued by notifyBuildSaved/notifyBuildDeleted -
  // never re-uploads the whole local array.
  async function flushPending() {
    if (pushInFlight) { pushQueuedAgain = true; return; }
    const toUpsert = Array.from(pendingUpsertById.values());
    const toDelete = Array.from(pendingDeleteIds);
    pendingUpsertById = new Map();
    pendingDeleteIds = new Set();
    if (!toUpsert.length && !toDelete.length) return;
    pushInFlight = true;
    try {
      if (toDelete.length) await deleteCloudBuilds(toDelete);
      if (toUpsert.length) await upsertCloudBuilds(toUpsert);
    } catch (error) {
      console.error("[K-Labs Studio] Build cloud sync failed:", error);
      // Re-queue so the next successful attempt (next save, or a later retry) still carries this change.
      toUpsert.forEach((record) => pendingUpsertById.set(String(record.id), record));
      toDelete.forEach((id) => pendingDeleteIds.add(id));
    } finally {
      pushInFlight = false;
      if (pushQueuedAgain) { pushQueuedAgain = false; scheduleFlush(); }
    }
  }

  window.KLABS_BUILD_SYNC = {
    onAuthStateChanged(session) {
      const nextUserId = session?.user?.id || "";
      if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
      pendingUpsertById = new Map();
      pendingDeleteIds = new Set();
      currentUserId = nextUserId;
      if (!currentUserId) return Promise.resolve();
      return mergeAndSync().catch((error) => {
        console.error("[K-Labs Studio] Build library sync error:", error);
      });
    },
    // Queues exactly the one changed record - id is that record's own stable id (see js/ui.js persistBuildRecord).
    notifyBuildSaved(record) {
      if (!currentUserId || !record || !record.id) return;
      pendingDeleteIds.delete(String(record.id));
      pendingUpsertById.set(String(record.id), record);
      scheduleFlush();
    },
    notifyBuildDeleted(id) {
      if (!currentUserId || !id) return;
      pendingUpsertById.delete(String(id));
      pendingDeleteIds.add(String(id));
      scheduleFlush();
    },
  };
})();
