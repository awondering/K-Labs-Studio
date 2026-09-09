// Component library ↔ Supabase sync.
// - js/ui.js keys the component library/taxonomy local storage per signed-in account: signed-out/never-
//   migrated usage stays on the original bare "anonymous" key forever (never deleted); each authenticated
//   account gets its own `:<uid>` suffixed key.
// - The FIRST authenticated account ever to encounter a populated anonymous library permanently claims it
//   via a durable owner marker (klabs-component-library-anonymous-owner) and gets a one-time, non-destructive
//   COPY of it into their own namespace, so it stays fully visible/editable locally even if they choose NOT
//   NOW. Ownership is never re-derived from "whoever is currently signed in" - once claimed, no other account
//   is ever offered, shown, or able to upload that legacy data, even after the owner signs out.
// - On every sign-in the local namespace and the cloud library are MERGED (union keyed by stable record
//   id, then by name/brand/variant/category/subcategory identity, most-complete record wins); the merged
//   result is stored locally and uploaded once. Seeded/default starter records are filtered out of every
//   signed-in path so defaults can never pollute or reappear in an account library.
// - Once an account is "linked", ongoing edits sync via a pull-before-push reconcile: remote additions,
//   remote deletions and per-record conflicts (using a persisted cloud updated_at baseline) are resolved
//   BEFORE uploading, so a stale session can never blindly overwrite newer cloud data with its full local
//   library. Only records that actually differ are written.
// - No realtime subscriptions: merge-on-login plus pull-before-push on each change is the sync model.
(function () {
  const MIGRATION_FLAG_PREFIX = "klabs-component-cloud-linked";
  const KNOWN_IDS_PREFIX = "klabs-component-cloud-known-ids";
  const KNOWN_UPDATED_PREFIX = "klabs-component-cloud-known-updated";
  const ANONYMOUS_OWNER_KEY = "klabs-component-library-anonymous-owner";
  const RECONCILE_DEBOUNCE_MS = 700;

  let currentUserId = "";
  let syncState = { status: "local", error: "", count: 0 };
  let reconcileTimer = null;
  let taxonomyTimer = null;
  let reconcileInFlight = false;
  let reconcileQueuedAgain = false;
  let lastErrorKind = ""; // 'push' | 'pull' - decides what Retry actually resumes
  let suppressLocalNotify = false; // set while the sync layer itself writes local records, so its own save does not schedule another push

  function client() {
    return window.KLABS_SUPABASE_CLIENT;
  }

  function notify() {
    try {
      window.KLABS_UI?.renderComponentSyncStatus?.(syncState);
    } catch (error) {
      console.error("[K-Labs Studio] Component sync status render failed:", error);
    }
  }

  function setState(patch) {
    syncState = { ...syncState, ...patch };
    notify();
  }

  function migrationFlagKey() {
    return `${MIGRATION_FLAG_PREFIX}:${currentUserId}`;
  }
  function knownIdsKey() {
    return `${KNOWN_IDS_PREFIX}:${currentUserId}`;
  }
  function isLinked() {
    return !!window.Store.get(migrationFlagKey(), false);
  }
  function getKnownCloudIds() {
    return new Set(window.Store.get(knownIdsKey(), []));
  }
  function setKnownCloudIds(idSet) {
    window.Store.set(knownIdsKey(), Array.from(idSet));
  }
  function knownUpdatedKey() {
    return `${KNOWN_UPDATED_PREFIX}:${currentUserId}`;
  }
  // Per-record cloud updated_at values as of this context's last successful sync. This baseline is what
  // lets a push tell "I edited this record" apart from "another session changed it since I last synced".
  function getKnownUpdated() {
    const raw = window.Store.get(knownUpdatedKey(), {});
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  }
  function setKnownUpdated(map) {
    window.Store.set(knownUpdatedKey(), map && typeof map === "object" ? map : {});
  }
  function setKnownUpdatedFromRows(rows) {
    const map = {};
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const id = String(row && row.client_id || "");
      if (id) map[id] = String(row.updated_at || "");
    });
    setKnownUpdated(map);
  }
  // Seeded starter records are reproducible defaults, never user data; they must stay out of signed-in
  // account libraries. Detection lives in js/ui.js (it owns the seed catalogue).
  function isSeedRecord(record) {
    try {
      const fn = window.KLABS_UI?.isStarterComponentRecord;
      const result = !!fn?.(record);
      // TEMPORARY DIAGNOSTIC: confirm which implementation reference the sync layer is actually calling.
      if (typeof window !== "undefined") {
        window.__klabsSeedCallerCount = (window.__klabsSeedCallerCount || 0);
        if (window.__klabsSeedCallerCount < 1) {
          window.__klabsSeedCallerCount++;
          console.log("[MIG-TRACE] isSeedRecord caller", {
            hasKlabsUi: !!window.KLABS_UI,
            hasFn: typeof fn === "function",
            fnSourceHead: typeof fn === "function" ? String(fn).slice(0, 90) : "(none)",
          });
        }
      }
      return result;
    } catch (error) {
      return false;
    }
  }
  // Writes local records without triggering the debounced push (used when the sync layer itself is the
  // one writing, e.g. applying a merge/pull result).
  function saveLocalRecordsSilently(records) {
    suppressLocalNotify = true;
    window.saveComponentLibraryRecords(records);
  }
  function anonymousLibraryOwner() {
    return String(window.Store.get(ANONYMOUS_OWNER_KEY, "") || "");
  }
  // Runs at the top of every sign-in sync. Records the anonymous library's first-ever owner (marker only),
  // and copies it into this account's namespace ONLY when cloud already has data (the merge below then
  // uploads it). When cloud is empty it deliberately does NOT pre-populate the namespace - the
  // empty-namespace+empty-cloud branch in runMigrationOrSync is the single path that dedupes, writes,
  // uploads and verifies the import. The anonymous source is only ever read, never written/cleared.
  // Pure seeded/default anonymous data is NOT claimed: it is reproducible and must never enter an account.
  function claimAnonymousLibraryIfNeeded(cloudHasData) {
    const anonymousRecords = window.KLABS_UI?.readAnonymousComponentLibraryRecords?.() || [];
    const realRecords = anonymousRecords.filter((record) => !isSeedRecord(record));
    // TEMPORARY DIAGNOSTIC
    console.log("[MIG-TRACE] claim enter", {
      uid: !!currentUserId,
      hasKlabsUi: !!window.KLABS_UI,
      hasReadAnon: typeof window.KLABS_UI?.readAnonymousComponentLibraryRecords === "function",
      anonRaw: anonymousRecords.length,
      anonReal: realRecords.length,
      cloudHasData: !!cloudHasData,
      owner: anonymousLibraryOwner() ? "set" : "unset",
      ownNamespaceCount: (() => { try { return window.componentLibraryRecords().length; } catch (e) { return "err:" + e.message; } })(),
    });
    if (!realRecords.length) return;
    const owner = anonymousLibraryOwner();
    if (!owner) {
      window.Store.set(ANONYMOUS_OWNER_KEY, currentUserId);
    } else if (owner !== currentUserId) {
      return;
    }
    const ownNamespaceEmpty = window.componentLibraryRecords().length === 0;
    if (!ownNamespaceEmpty) return;
    if (!cloudHasData) return;
    saveLocalRecordsSilently(realRecords);
    const anonymousTaxonomy = window.KLABS_UI?.readAnonymousComponentTaxonomy?.() || { categories: [], suppliers: [] };
    if (anonymousTaxonomy.categories.length || anonymousTaxonomy.suppliers.length) {
      window.KLABS_UI?.applyCloudComponentTaxonomy?.(anonymousTaxonomy);
    }
  }

  function normalizeSyncText(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  }
  // Stable-normalised identity for duplicate detection: name + brand + variant + category + subcategory.
  function componentDuplicateKey(record) {
    return ["name", "brand", "variant", "category", "subcategory"]
      .map((key) => normalizeSyncText(record && record[key]))
      .join("|");
  }
  function componentCompletenessScore(record) {
    if (!record) return 0;
    const textFields = ["brand", "variant", "description", "customerLabel", "unit", "notes", "specifications", "supplier", "subcategory"];
    let score = textFields.reduce((total, key) => total + (String(record[key] || "").trim() ? 1 : 0), 0);
    if (record.unitCost !== undefined) score += 1;
    if (record.unitPrice !== undefined) score += 1;
    if (record.stockOnHand !== undefined) score += 1;
    if (Array.isArray(record.sizeOptions) && record.sizeOptions.length) score += 1;
    return score;
  }
  // Keeps one logical record per duplicate key, preferring whichever side has more real data filled in.
  function mergeMostComplete(a, b) {
    return componentCompletenessScore(b) > componentCompletenessScore(a) ? { ...b, id: a.id || b.id } : { ...a, id: a.id || b.id };
  }
  function dedupeLocalRecords(records) {
    const order = [];
    const map = new Map();
    (records || []).forEach((record) => {
      const key = componentDuplicateKey(record) || `id:${record.id || Math.random()}`;
      if (map.has(key)) {
        map.set(key, mergeMostComplete(map.get(key), record));
      } else {
        map.set(key, record);
        order.push(key);
      }
    });
    return order.map((key) => map.get(key));
  }

  // True when a local record and a cloud-derived record carry identical sync-relevant content.
  function syncComparableJson(record) {
    const r = record || {};
    const text = (value) => String(value || "");
    const num = (value) => (value === undefined || value === null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value));
    return JSON.stringify({
      name: text(r.name),
      categoryId: text(r.categoryId),
      category: text(r.category),
      subcategory: text(r.subcategory),
      supplier: text(r.supplier),
      brand: text(r.brand),
      variant: text(r.variant),
      description: text(r.description),
      customerLabel: text(r.customerLabel),
      unit: text(r.unit),
      quantity: num(r.quantity),
      unitCost: num(r.unitCost),
      unitPrice: num(r.unitPrice),
      stockOnHand: num(r.stockOnHand),
      notes: text(r.notes),
      specifications: text(r.specifications),
      cost: num(r.cost),
      sizeOptions: normalizeSyncSizeOptions(r.sizeOptions),
    });
  }
  function recordsEqualForSync(a, b) {
    return syncComparableJson(a) === syncComparableJson(b);
  }

  // Union of local + cloud records. Identity: stable record id first, then the duplicate key
  // (name/brand/variant/category/subcategory) so the same logical component created on two devices
  // collapses to one. Conflicts resolve via mergeMostComplete (whichever side has more real data wins;
  // content ties keep the cloud side since cloud records are added first). The surviving record keeps the
  // first-seen (cloud) id so cloud identity is preserved; absorbed duplicate cloud ids are reported so the
  // caller can delete exactly those rows (exact duplicates only - never user-unique data).
  function mergeRecordSets(localRecords, cloudRecords) {
    const merged = [];
    const indexById = new Map();
    const indexByDup = new Map();
    const droppedCloudIds = new Set();
    const add = (record) => {
      if (!record || !record.id) return;
      const id = String(record.id);
      const dupKey = componentDuplicateKey(record) || `id:${id}`;
      const index = indexById.has(id) ? indexById.get(id) : (indexByDup.has(dupKey) ? indexByDup.get(dupKey) : -1);
      if (index < 0) {
        indexById.set(id, merged.length);
        indexByDup.set(dupKey, merged.length);
        merged.push(record);
        return;
      }
      const current = merged[index];
      const winner = mergeMostComplete(current, record);
      if (id !== String(current.id)) droppedCloudIds.add(id);
      merged[index] = winner;
      indexById.set(String(winner.id), index);
      indexByDup.set(componentDuplicateKey(winner) || `id:${winner.id}`, index);
    };
    (cloudRecords || []).forEach(add);
    (localRecords || []).forEach(add);
    return { merged, droppedCloudIds };
  }

  // Union of local + cloud taxonomy ({categories:[{id,name,subcategories}],suppliers:[{id,name}]});
  // matched by normalised name, cloud ids win ties, local-only entries are preserved.
  function mergeTaxonomies(localTaxonomy, cloudTaxonomy) {
    const local = localTaxonomy && typeof localTaxonomy === "object" ? localTaxonomy : {};
    const cloud = cloudTaxonomy && typeof cloudTaxonomy === "object" ? cloudTaxonomy : {};
    const categories = [];
    const categoryByName = new Map();
    const addCategory = (category) => {
      if (!category || !normalizeSyncText(category.name)) return;
      const key = normalizeSyncText(category.name);
      const subs = Array.isArray(category.subcategories) ? category.subcategories : [];
      const existing = categoryByName.get(key);
      if (existing) {
        subs.forEach((sub) => {
          const subKey = normalizeSyncText(sub && sub.name);
          if (!subKey) return;
          if (!existing.subcategories.some((row) => normalizeSyncText(row.name) === subKey)) {
            existing.subcategories.push({ id: String(sub.id || ""), name: String(sub.name || "").trim() });
          }
        });
        return;
      }
      const next = {
        id: String(category.id || ""),
        name: String(category.name || "").trim(),
        subcategories: subs
          .filter((sub) => sub && normalizeSyncText(sub.name))
          .map((sub) => ({ id: String(sub.id || ""), name: String(sub.name || "").trim() })),
      };
      categoryByName.set(key, next);
      categories.push(next);
    };
    (Array.isArray(cloud.categories) ? cloud.categories : []).forEach(addCategory);
    (Array.isArray(local.categories) ? local.categories : []).forEach(addCategory);
    const suppliers = [];
    const seenSuppliers = new Set();
    [...(Array.isArray(cloud.suppliers) ? cloud.suppliers : []), ...(Array.isArray(local.suppliers) ? local.suppliers : [])].forEach((supplier) => {
      const key = normalizeSyncText(supplier && supplier.name);
      if (!key || seenSuppliers.has(key)) return;
      seenSuppliers.add(key);
      suppliers.push({ id: String(supplier.id || ""), name: String(supplier.name || "").trim() });
    });
    return { categories, suppliers };
  }

  // The taxonomy JSON is only half the picture: the UI also harvests category/subcategory names from the
  // component records themselves (records reference taxonomy by NAME). After a merge, re-harvest from the
  // merged records so cloud-only subcategories (e.g. ones that were only ever present on another device's
  // records) are restored into the taxonomy instead of silently disappearing. Never removes entries.
  function enrichTaxonomyFromRecords(taxonomy, records) {
    const base = taxonomy && typeof taxonomy === "object" ? taxonomy : {};
    const categories = Array.isArray(base.categories) ? base.categories.map((category) => ({
      id: String(category && category.id || ""),
      name: String(category && category.name || "").trim(),
      subcategories: Array.isArray(category && category.subcategories) ? category.subcategories.slice() : [],
    })) : [];
    const suppliers = Array.isArray(base.suppliers) ? base.suppliers.map((supplier) => ({
      id: String(supplier && supplier.id || ""),
      name: String(supplier && supplier.name || "").trim(),
    })) : [];
    const newId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    (Array.isArray(records) ? records : []).forEach((record) => {
      const categoryName = String(record && record.category || "").trim();
      const categoryKey = normalizeSyncText(categoryName);
      if (categoryKey) {
        let category = categories.find((item) => normalizeSyncText(item.name) === categoryKey);
        if (!category) {
          category = { id: String(record.categoryId || "") || newId("cat"), name: categoryName, subcategories: [] };
          categories.push(category);
        }
        const subName = String(record && record.subcategory || "").trim();
        const subKey = normalizeSyncText(subName);
        if (subKey && !category.subcategories.some((sub) => normalizeSyncText(sub && sub.name) === subKey)) {
          category.subcategories.push({ id: newId("sub"), name: subName });
        }
      }
      const supplierName = String(record && record.supplier || "").trim();
      const supplierKey = normalizeSyncText(supplierName);
      if (supplierKey && !suppliers.some((supplier) => normalizeSyncText(supplier.name) === supplierKey)) {
        suppliers.push({ id: newId("sup"), name: supplierName });
      }
    });
    return { categories, suppliers };
  }
  // Apply the final taxonomy locally (same cache + persistence step as any cloud pull) and push it back up.
  async function publishTaxonomy(taxonomy) {
    window.KLABS_UI?.applyCloudComponentTaxonomy?.(taxonomy);
    await upsertCloudTaxonomy(taxonomy);
  }
  // Supabase exactly once, persist it locally, and mark the account linked. Only exact absorbed duplicates
  // are ever deleted from cloud. Returns the merged record count.
  async function publishMergedLibrary(cloudRows, cloudTaxonomyRow) {
    const knownIds = getKnownCloudIds();
    const cloudIds = new Set((Array.isArray(cloudRows) ? cloudRows : []).map((row) => String(row.client_id)));
    const localRecords = window.componentLibraryRecords()
      .filter((record) => record.id && !isSeedRecord(record))
      // Tombstone baseline (the same rule reconcileNow already applies): a local record this context
      // previously confirmed in cloud, now absent from cloud, was deleted on another device - honour that
      // deletion instead of letting the stale local copy win the merge and be re-uploaded. Records never
      // known to cloud (created offline/unlinked; baseline is empty pre-link) are always preserved.
      .filter((record) => !knownIds.has(record.id) || cloudIds.has(record.id));
    const cloudRecords = (Array.isArray(cloudRows) ? cloudRows : []).map(rowToRecord);
    const { merged, droppedCloudIds } = mergeRecordSets(localRecords, cloudRecords);
    const absorbedIds = Array.from(droppedCloudIds).filter((id) => cloudIds.has(id));
    if (absorbedIds.length) await deleteCloudComponents(absorbedIds);
    if (merged.length) await upsertCloudComponents(merged);
    const verify = await verifyCloudComponents(merged.map((record) => record.id));
    if (!verify.ok) {
      throw new Error(`Upload verification failed: ${verify.missing.length} of ${merged.length} components could not be confirmed in your account.`);
    }
    saveLocalRecordsSilently(merged);
    const localTaxonomy = window.ensureStudioComponentTaxonomyLoaded();
    const cloudTaxonomy = cloudTaxonomyRow && cloudTaxonomyRow.taxonomy ? cloudTaxonomyRow.taxonomy : null;
    const mergedTaxonomy = cloudTaxonomy ? mergeTaxonomies(localTaxonomy, cloudTaxonomy) : localTaxonomy;
    // Recover any category/subcategory that lives only on the merged component records (e.g. subcategories
    // whose seed records were filtered out of a stale local cache before the taxonomy could harvest them).
    const finalTaxonomy = enrichTaxonomyFromRecords(mergedTaxonomy, merged);
    await publishTaxonomy(finalTaxonomy);
    window.Store.set(migrationFlagKey(), true);
    setKnownCloudIds(new Set(merged.map((record) => record.id)));
    setKnownUpdatedFromRows(verify.rows);
    lastErrorKind = "";
    setState({ status: "synced", error: "", count: merged.length });
    window.KLABS_UI?.refreshComponentLibraryViews?.();
    return merged.length;
  }

  // size_options is a jsonb array of plain size labels; tolerate a JSON string from older/pg driver paths.
  function normalizeSyncSizeOptions(value) {
    let list = value;
    if (typeof list === "string") {
      try {
        list = JSON.parse(list);
      } catch (err) {
        list = [];
      }
    }
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const next = [];
    list.forEach((entry) => {
      if (entry === null || entry === undefined || typeof entry === "object") return;
      const label = String(entry).replace(/\s+/g, " ").trim();
      if (!label) return;
      const key = label.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      next.push(label);
    });
    return next;
  }

  function recordToRow(record) {
    return {
      user_id: currentUserId,
      client_id: String(record.id || ""),
      name: String(record.name || "").trim(),
      category: String(record.category || ""),
      category_id: String(record.categoryId || ""),
      subcategory: String(record.subcategory || ""),
      supplier: String(record.supplier || ""),
      brand: String(record.brand || ""),
      variant: String(record.variant || ""),
      description: String(record.description || ""),
      customer_label: String(record.customerLabel || ""),
      unit: String(record.unit || ""),
      quantity: record.quantity === undefined ? null : record.quantity,
      unit_cost: record.unitCost === undefined ? null : record.unitCost,
      unit_price: record.unitPrice === undefined ? null : record.unitPrice,
      cost: record.cost === undefined ? null : record.cost,
      stock_on_hand: record.stockOnHand === undefined ? null : record.stockOnHand,
      specifications: String(record.specifications || ""),
      notes: String(record.notes || ""),
      size_options: normalizeSyncSizeOptions(record.sizeOptions),
      updated_at: new Date().toISOString(),
    };
  }
  function rowToRecord(row) {
    return {
      id: String(row.client_id || ""),
      name: String(row.name || ""),
      categoryId: String(row.category_id || ""),
      category: String(row.category || ""),
      subcategory: String(row.subcategory || ""),
      supplier: String(row.supplier || ""),
      brand: String(row.brand || ""),
      variant: String(row.variant || ""),
      description: String(row.description || ""),
      customerLabel: String(row.customer_label || ""),
      unit: String(row.unit || ""),
      quantity: row.quantity === null || row.quantity === undefined ? undefined : Number(row.quantity),
      unitCost: row.unit_cost === null || row.unit_cost === undefined ? undefined : Number(row.unit_cost),
      unitPrice: row.unit_price === null || row.unit_price === undefined ? undefined : Number(row.unit_price),
      stockOnHand: row.stock_on_hand === null || row.stock_on_hand === undefined ? undefined : Number(row.stock_on_hand),
      notes: String(row.notes || ""),
      specifications: String(row.specifications || ""),
      sizeOptions: normalizeSyncSizeOptions(row.size_options),
      cost: row.cost === null || row.cost === undefined ? undefined : Number(row.cost),
    };
  }

  // Composes a readable message from a raw Supabase/PostgREST error (message/details/hint/code), which is
  // normally swallowed by a generic "could not sync" string - needed to actually see WHY an upload/fetch
  // failed (RLS rejection, missing constraint, bad payload, etc.) instead of guessing.
  function supabaseErrorMessage(error, fallback) {
    if (!error) return fallback;
    const parts = [error.message, error.details, error.hint, error.code ? `code ${error.code}` : ""].filter(Boolean);
    return parts.join(" — ") || fallback;
  }
  async function fetchCloudComponents() {
    const { data, error } = await client().from("components").select("*").eq("user_id", currentUserId);
    if (error) {
      console.error("[K-Labs Studio] Supabase components fetch failed:", { message: error.message, details: error.details, hint: error.hint, code: error.code });
      throw new Error(supabaseErrorMessage(error, "Could not read your components from Supabase."));
    }
    return Array.isArray(data) ? data : [];
  }
  async function fetchCloudTaxonomy() {
    const { data, error } = await client().from("component_taxonomy").select("*").eq("user_id", currentUserId).maybeSingle();
    if (error) throw error;
    return data || null;
  }
  async function upsertCloudComponents(records) {
    if (!records.length) return;
    // A single upsert() call is one Postgres statement; if two rows in the SAME request share a (user_id,
    // client_id) conflict key, Postgres rejects the WHOLE batch ("ON CONFLICT DO UPDATE command cannot
    // affect row a second time in the same command") - a legacy duplicate-id local record would otherwise
    // fail every other record's upload too. Collapse to one row per client_id (last one wins) first.
    const byClientId = new Map();
    records.forEach((record) => { byClientId.set(String(record.id || ""), record); });
    const rows = Array.from(byClientId.values()).map(recordToRow);
    const { error } = await client().from("components").upsert(rows, { onConflict: "user_id,client_id" });
    if (error) {
      console.error("[K-Labs Studio] Supabase components upsert failed:", { message: error.message, details: error.details, hint: error.hint, code: error.code, rowCount: rows.length });
      throw new Error(supabaseErrorMessage(error, "Could not upload components to Supabase."));
    }
  }
  async function deleteCloudComponents(ids) {
    if (!ids.length) return;
    const { error } = await client().from("components").delete().eq("user_id", currentUserId).in("client_id", ids);
    if (error) throw error;
  }
  async function upsertCloudTaxonomy(taxonomy) {
    const { error } = await client()
      .from("component_taxonomy")
      .upsert({ user_id: currentUserId, taxonomy: taxonomy || { categories: [], suppliers: [] }, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) throw error;
  }
  async function verifyCloudComponents(expectedIds) {
    const rows = await fetchCloudComponents();
    const gotIds = new Set(rows.map((row) => String(row.client_id)));
    const missing = expectedIds.filter((id) => !gotIds.has(id));
    return { ok: missing.length === 0, rows, missing };
  }

  // Pull-before-push reconcile: fetch the current cloud library FIRST, apply remote additions/deletions
  // and resolve per-record conflicts against the persisted updated_at baseline, then upload only what
  // actually differs. A stale session therefore merges with newer cloud data instead of blindly
  // overwriting it with its full local library. Idempotent; safe to call repeatedly/after a failure.
  // Deletions only ever happen for explicit local deletes (ids this context previously knew in cloud) and
  // exact duplicates absorbed by dedupe - never for unknown cloud records, which are pulled in instead.
  async function reconcileNow() {
    if (!currentUserId || !isLinked()) return;
    if (reconcileInFlight) {
      reconcileQueuedAgain = true;
      return;
    }
    reconcileInFlight = true;
    setState({ status: "syncing", error: "" });
    try {
      const knownIds = getKnownCloudIds();
      const knownUpdated = getKnownUpdated();
      const haveBaseline = Object.keys(knownUpdated).length > 0;
      const cloudRows = await fetchCloudComponents();
      const cloudById = new Map(cloudRows.map((row) => [String(row.client_id), row]));
      const localRecords = window.componentLibraryRecords().filter((record) => record.id && !isSeedRecord(record));

      // Gate on the FULL local library (unfiltered), not the seed-filtered view: a library made mostly of
      // edited starter-catalogue rows can otherwise read as "nothing real" here and fall through into the
      // merge/delete logic below, which would then tombstone-delete every previously-known cloud id.
      const allOwnRecords = window.componentLibraryRecords().filter((record) => record.id);
      if (cloudRows.length === 0 && allOwnRecords.length > 0) {
        // Ambiguous empty cloud read on a linked account: never treat it as "everything was deleted".
        // Self-heal by re-pushing this account's own records, with no deletions.
        await upsertCloudComponents(allOwnRecords);
        const verify = await verifyCloudComponents(allOwnRecords.map((record) => record.id));
        if (!verify.ok || verify.rows.length !== allOwnRecords.length) {
          throw new Error(`Cloud verification failed: expected ${allOwnRecords.length}, found ${verify.rows.length}.`);
        }
        setKnownCloudIds(new Set(allOwnRecords.map((record) => record.id)));
        setKnownUpdatedFromRows(verify.rows);
        lastErrorKind = "";
        setState({ status: "synced", error: "", count: allOwnRecords.length });
        return;
      }

      const localIds = new Set(localRecords.map((record) => record.id));
      // Deleted on another device since our last sync: known to us before, absent from cloud now.
      const remotelyDeletedIds = new Set(Array.from(knownIds).filter((id) => localIds.has(id) && !cloudById.has(id)));
      // Created on another device: in cloud, but never known to this context. Pulled in, never deleted.
      const pulledRecords = [];
      cloudRows.forEach((row) => {
        const id = String(row.client_id);
        if (!localIds.has(id) && !knownIds.has(id)) pulledRecords.push(rowToRecord(row));
      });

      const workingById = new Map(localRecords.map((record) => [record.id, record]));
      const upsertById = new Map();
      localRecords.forEach((record) => {
        const row = cloudById.get(record.id);
        if (!row) {
          upsertById.set(record.id, record); // new local record, not yet in cloud
          return;
        }
        const cloudRecord = rowToRecord(row);
        if (recordsEqualForSync(record, cloudRecord)) return; // already in sync
        const knownTs = String(knownUpdated[record.id] || "");
        if (haveBaseline && knownTs && knownTs === String(row.updated_at || "")) {
          upsertById.set(record.id, record); // cloud untouched since our last sync: this session's edit wins
        } else {
          // Genuine race (cloud changed by another session) or no baseline yet: deterministic merge,
          // whichever side carries more real data wins, so neither session's details are silently lost.
          const winner = mergeMostComplete(record, cloudRecord);
          workingById.set(record.id, winner);
          upsertById.set(record.id, winner);
        }
      });

      // Apply remote deletions + conflict winners + pulled records, then dedupe the working set.
      const surviving = localRecords
        .filter((record) => !remotelyDeletedIds.has(record.id))
        .map((record) => workingById.get(record.id) || record)
        .concat(pulledRecords);
      const { merged: finalRecords, droppedCloudIds } = mergeRecordSets(surviving, []);
      const finalIds = new Set(finalRecords.map((record) => record.id));

      // Explicit local deletes: ids this context knew in cloud that are no longer present locally.
      const deleteIds = new Set(Array.from(knownIds).filter((id) => !finalIds.has(id)));
      Array.from(droppedCloudIds).forEach((id) => {
        if (cloudById.has(id) && !finalIds.has(id)) deleteIds.add(id);
      });
      // Pulled/dedupe winners whose content now differs from their cloud row must be uploaded too.
      finalRecords.forEach((record) => {
        if (upsertById.has(record.id)) return;
        const row = cloudById.get(record.id);
        if (!row || !recordsEqualForSync(record, rowToRecord(row))) upsertById.set(record.id, record);
      });
      const toUpsert = Array.from(upsertById.values()).filter((record) => finalIds.has(record.id));
      const toDelete = Array.from(deleteIds);

      if (toDelete.length) await deleteCloudComponents(toDelete);
      if (toUpsert.length) await upsertCloudComponents(toUpsert);
      const verify = await verifyCloudComponents(Array.from(finalIds));
      if (!verify.ok) throw new Error(`Verification failed: ${verify.missing.length} component(s) missing after upload.`);
      saveLocalRecordsSilently(finalRecords);
      setKnownCloudIds(finalIds);
      setKnownUpdatedFromRows(verify.rows);
      lastErrorKind = "";
      setState({ status: "synced", error: "", count: finalRecords.length });
      window.KLABS_UI?.refreshComponentLibraryViews?.();
    } catch (error) {
      console.error("[K-Labs Studio] Component library cloud sync failed:", error);
      lastErrorKind = "push";
      setState({ status: "error", error: "Could not sync your latest component changes. Local data is unchanged and will retry." });
    } finally {
      reconcileInFlight = false;
      if (reconcileQueuedAgain) {
        reconcileQueuedAgain = false;
        reconcileNow();
      }
    }
  }
  function scheduleReconcile() {
    if (suppressLocalNotify) {
      suppressLocalNotify = false;
      return;
    }
    if (!currentUserId || !isLinked()) return;
    if (reconcileTimer) clearTimeout(reconcileTimer);
    reconcileTimer = setTimeout(() => {
      reconcileTimer = null;
      reconcileNow();
    }, RECONCILE_DEBOUNCE_MS);
  }
  function scheduleTaxonomyReconcile() {
    if (!currentUserId || !isLinked()) return;
    if (taxonomyTimer) clearTimeout(taxonomyTimer);
    taxonomyTimer = setTimeout(() => {
      taxonomyTimer = null;
      upsertCloudTaxonomy(window.ensureStudioComponentTaxonomyLoaded()).catch((error) => {
        console.error("[K-Labs Studio] Component taxonomy cloud sync failed:", error);
        setState({ status: "error", error: "Could not sync your latest category/supplier changes." });
      });
    }, RECONCILE_DEBOUNCE_MS);
  }

  // What this account's own namespace currently holds - after claimAnonymousLibraryIfNeeded() has already
  // run, this includes a copied-in legacy anonymous library for the account that owns it, and stays empty
  // (with zero access to anyone else's legacy data) for every other account.
  async function runMigrationOrSync() {
    // Fetch cloud first so the anonymous-claim step knows whether this is an empty-cloud import or a
    // merge-with-existing-cloud claim.
    setState({ status: "syncing", error: "" });
    let cloudRows, cloudTaxonomyRow;
    try {
      [cloudRows, cloudTaxonomyRow] = await Promise.all([fetchCloudComponents(), fetchCloudTaxonomy()]);
    } catch (error) {
      console.error("[K-Labs Studio] Component library sync failed to read from Supabase:", error);
      lastErrorKind = "pull";
      setState({ status: "error", error: "Could not reach your component library. Local data is unchanged." });
      return;
    }
    claimAnonymousLibraryIfNeeded(cloudRows.length > 0);
    const linked = isLinked();
    // TEMPORARY DIAGNOSTIC
    console.log("[MIG-TRACE] runMigrationOrSync after-fetch", { cloudRows: cloudRows.length, linked: linked });

    // One-time anonymous -> account import. Runs whenever cloud is empty AND this account's namespace is
    // empty AND the anonymous store holds records - INDEPENDENT of the linked flag, because an earlier
    // buggy build could have set linked=true while both stores were empty (the exact state this repairs).
    // This is the user's existing working library, so it is taken AS-IS with NO seed filtering; only true
    // duplicates are collapsed. Dedupe -> write namespaced -> upload -> verify -> only then link.
    // The anonymous source is never deleted.
    if (cloudRows.length === 0) {
      const ownCount = window.componentLibraryRecords().length;
      const anonymousAll = window.KLABS_UI?.readAnonymousComponentLibraryRecords?.() || [];
      // TEMPORARY DIAGNOSTIC
      console.log("[MIG-TRACE] import gate", { ownCount, anonymousAll: anonymousAll.length, enters: ownCount === 0 && anonymousAll.length > 0 });
      if (ownCount === 0 && anonymousAll.length > 0) {
        try {
          const deduped = dedupeLocalRecords(anonymousAll);
          console.log("[MIG-TRACE] deduped", { count: deduped.length });
          saveLocalRecordsSilently(deduped);
          const withIds = window.componentLibraryRecords().filter((record) => record.id);
          console.log("[MIG-TRACE] namespaced after save", { count: withIds.length });
          await upsertCloudComponents(withIds);
          console.log("[MIG-TRACE] upload attempted", { count: withIds.length });
          const verify = await verifyCloudComponents(withIds.map((record) => record.id));
          console.log("[MIG-TRACE] verify", { ok: verify.ok, missing: verify.missing.length, cloudRowsNow: verify.rows.length });
          if (!verify.ok) {
            throw new Error(`Migration verification failed: ${verify.missing.length} of ${withIds.length} components could not be confirmed in your account.`);
          }
          const localTaxonomy = window.ensureStudioComponentTaxonomyLoaded();
          const finalTaxonomy = enrichTaxonomyFromRecords(localTaxonomy, withIds);
          await publishTaxonomy(finalTaxonomy);
          window.Store.set(migrationFlagKey(), true);
          setKnownCloudIds(new Set(withIds.map((record) => record.id)));
          setKnownUpdatedFromRows(verify.rows);
          lastErrorKind = "";
          setState({ status: "synced", error: "", count: withIds.length });
          window.KLABS_UI?.refreshComponentLibraryViews?.();
          return;
        } catch (error) {
          console.error("[K-Labs Studio] Anonymous component library migration failed:", error);
          console.log("[MIG-TRACE] import error", { message: error && error.message, code: error && error.code, details: error && error.details, hint: error && error.hint });
          lastErrorKind = "push";
          setState({ status: "error", error: "Could not move your local component library to your account. Local data is unchanged." });
          return;
        }
      }
    }

    if (cloudRows.length === 0 && !linked) {
      const ownRecords = window.componentLibraryRecords().filter((record) => record.id);
      const realRecords = ownRecords.filter((record) => !isSeedRecord(record));
      if (realRecords.length === 0) {
        // Nothing anywhere but reproducible seeded/default records (or nothing at all): never upload
        // defaults and never prompt. Pure seeds are dropped locally so a signed-in account starts from its
        // (empty) cloud library instead of re-polluting it.
        if (ownRecords.length) saveLocalRecordsSilently([]);
        // Component rows may be empty while a taxonomy row still exists - never let the local seed
        // taxonomy overwrite it; restore the account's real categories/subcategories instead.
        if (cloudTaxonomyRow && cloudTaxonomyRow.taxonomy) {
          await publishTaxonomy(enrichTaxonomyFromRecords(cloudTaxonomyRow.taxonomy, []));
        }
        window.Store.set(migrationFlagKey(), true);
        setKnownCloudIds(new Set());
        setKnownUpdated({});
        setState({ status: "synced", error: "", count: 0 });
        return;
      }
      // First login with real local data in this account's own namespace and an empty cloud library:
      // needs an explicit user decision before anything is uploaded.
      setState({ status: "migration-pending", error: "", count: realRecords.length });
      window.KLABS_UI?.onComponentLibraryMigrationPending?.(realRecords.length);
      return;
    }

    // A previous local edit failed to push (offline/RLS/network). Never let a pull-based merge below
    // silently discard it - resume the push first instead. Only possible once linked.
    if (lastErrorKind === "push" && linked) {
      try {
        await reconcileNow();
      } catch (error) {
        console.error("[K-Labs Studio] Could not resume a pending local component change:", error);
      }
      return;
    }

    if (cloudRows.length === 0 && linked) {
      // Previously linked but cloud now reads empty: never treat this as "erase local", and never declare
      // SYNCED without a verified cloud row count. Use the FULL local library here (not seed-filtered) -
      // matches the RECORDS diagnostic exactly, so a library made of edited starter-catalogue rows is never
      // silently skipped just because it also matches the seed-detection signature.
      const ownRecords = window.componentLibraryRecords().filter((record) => record.id);
      if (ownRecords.length === 0) {
        setState({ status: "synced", error: "", count: 0 });
        return;
      }
      try {
        await upsertCloudComponents(ownRecords);
        const verify = await verifyCloudComponents(ownRecords.map((record) => record.id));
        if (!verify.ok || verify.rows.length !== ownRecords.length) {
          throw new Error(`Cloud verification failed: expected ${ownRecords.length}, found ${verify.rows.length}.`);
        }
        setKnownCloudIds(new Set(ownRecords.map((record) => record.id)));
        setKnownUpdatedFromRows(verify.rows);
        lastErrorKind = "";
        setState({ status: "synced", error: "", count: ownRecords.length });
      } catch (error) {
        console.error("[K-Labs Studio] Could not restore cloud component library from local cache:", error);
        lastErrorKind = "push";
        setState({ status: "error", error: supabaseErrorMessage(error, "Your account library looks empty in Supabase and re-sync failed. Local data is safe.") });
      }
      return;
    }

    // Cloud has data: MERGE local + cloud (union, deduped, seeds filtered) instead of replacing either
    // side, then publish the merged result back once. Supabase is authoritative for the account from here.
    try {
      await publishMergedLibrary(cloudRows, cloudTaxonomyRow);
    } catch (error) {
      console.error("[K-Labs Studio] Component library merge failed:", error);
      lastErrorKind = "push";
      setState({ status: "error", error: "Could not finish syncing your component library. Local data is unchanged." });
    }
  }

  window.KLABS_SYNC = {
    onAuthStateChanged(session) {
      const nextUserId = session?.user?.id || "";
      if (reconcileTimer) { clearTimeout(reconcileTimer); reconcileTimer = null; }
      if (taxonomyTimer) { clearTimeout(taxonomyTimer); taxonomyTimer = null; }
      currentUserId = nextUserId;
      lastErrorKind = "";
      if (!currentUserId) {
        setState({ status: "local", error: "", count: 0 });
        return Promise.resolve();
      }
      // Returned so callers (e.g. first-run seeding) can wait until any merge/sync has settled.
      return runMigrationOrSync().catch((error) => {
        console.error("[K-Labs Studio] Component library sync error:", error);
        setState({ status: "error", error: "Component library sync failed. Local data is unchanged." });
      });
    },
    notifyComponentsChanged() {
      scheduleReconcile();
    },
    notifyTaxonomyChanged() {
      scheduleTaxonomyReconcile();
    },
    async copyToAccount() {
      if (!currentUserId) return { ok: false, error: "You need to be signed in to sync your component library." };
      setState({ status: "syncing", error: "" });
      try {
        const [cloudRows, cloudTaxonomyRow] = await Promise.all([fetchCloudComponents(), fetchCloudTaxonomy()]);
        const count = await publishMergedLibrary(cloudRows, cloudTaxonomyRow);
        return { ok: true, count };
      } catch (error) {
        console.error("[K-Labs Studio] Copy to account failed:", error);
        setState({ status: "migration-pending", error: "", count: window.componentLibraryRecords().length });
        return { ok: false, error: "Could not copy your component library to your account. Your local data is unchanged." };
      }
    },
    // Writes nothing anywhere: this account's own namespace (already populated by claimAnonymousLibraryIfNeeded
    // if applicable) is left exactly as-is and remains fully usable/editable locally, permanently, until the
    // user explicitly chooses to migrate it later.
    notNow() {
      setState({ status: "local", error: "", count: window.componentLibraryRecords().length });
    },
    retry() {
      if (!currentUserId) return;
      if (lastErrorKind === "push" && isLinked()) {
        reconcileNow().catch((error) => console.error("[K-Labs Studio] Component library sync retry failed:", error));
        return;
      }
      runMigrationOrSync().catch((error) => console.error("[K-Labs Studio] Component library sync retry failed:", error));
    },
    getState() {
      return syncState;
    },
    // Manual recovery action for "Settings -> Account -> IMPORT LOCAL COMPONENTS". Completely separate
    // from the automatic runMigrationOrSync path above (not touched here): takes the complete anonymous
    // library as-is (no seed filtering), collapses only true/exact duplicates, writes it into this
    // account's own namespaced store, verifies that write, uploads to Supabase, verifies the cloud row
    // count, then rebuilds taxonomy from the imported records. The anonymous source is only ever read.
    async importLocalLibrary() {
      if (!currentUserId) return { ok: false, error: "You need to be signed in to import your local component library." };
      setState({ status: "syncing", error: "" });
      try {
        const anonymousRecords = window.KLABS_UI?.readAnonymousComponentLibraryRecords?.() || [];
        if (!anonymousRecords.length) {
          throw new Error("No local components were found to import.");
        }
        const deduped = dedupeLocalRecords(anonymousRecords);
        saveLocalRecordsSilently(deduped);
        const written = window.componentLibraryRecords().filter((record) => record.id);
        if (!written.length) {
          throw new Error("Import failed: components were not saved to your account library.");
        }
        await upsertCloudComponents(written);
        const verify = await verifyCloudComponents(written.map((record) => record.id));
        if (!verify.ok) {
          throw new Error(`Cloud upload verification failed: ${verify.missing.length} of ${written.length} component(s) could not be confirmed in your account.`);
        }
        if (verify.rows.length !== written.length) {
          throw new Error(`Cloud row count (${verify.rows.length}) does not match the ${written.length} uploaded component(s).`);
        }
        const localTaxonomy = window.ensureStudioComponentTaxonomyLoaded();
        const finalTaxonomy = enrichTaxonomyFromRecords(localTaxonomy, written);
        await publishTaxonomy(finalTaxonomy);
        window.Store.set(migrationFlagKey(), true);
        setKnownCloudIds(new Set(written.map((record) => record.id)));
        setKnownUpdatedFromRows(verify.rows);
        lastErrorKind = "";
        setState({ status: "synced", error: "", count: written.length });
        window.KLABS_UI?.refreshComponentLibraryViews?.();
        return { ok: true, count: written.length };
      } catch (error) {
        console.error("[K-Labs Studio] Manual local component import failed:", error);
        const message = (error && error.message) || "Could not import your local component library. Local data is unchanged.";
        setState({ status: "error", error: message });
        return { ok: false, error: message };
      }
    },
    // Manual recovery action for "Settings -> Account -> SYNC COMPONENTS TO CLOUD". Distinct from
    // importLocalLibrary: this never touches the anonymous store or taxonomy, and is meant for the case
    // where the signed-in namespaced RECORDS store is already correct but Supabase upload never landed.
    // Uploads the existing namespaced records as-is, re-fetches, and only reports SYNCED when the cloud
    // row count matches. RECORDS/ANON are never written here.
    async syncRecordsToCloud() {
      if (!currentUserId) return { ok: false, error: "You need to be signed in to sync your component library." };
      setState({ status: "syncing", error: "" });
      try {
        const records = window.componentLibraryRecords().filter((record) => record.id);
        if (!records.length) {
          throw new Error("No account components found to sync.");
        }
        await upsertCloudComponents(records);
        const verify = await verifyCloudComponents(records.map((record) => record.id));
        if (!verify.ok) {
          throw new Error(`Cloud upload verification failed: ${verify.missing.length} of ${records.length} component(s) could not be confirmed in your account.`);
        }
        if (verify.rows.length !== records.length) {
          throw new Error(`Cloud row count (${verify.rows.length}) does not match the ${records.length} account component(s).`);
        }
        setKnownCloudIds(new Set(records.map((record) => record.id)));
        setKnownUpdatedFromRows(verify.rows);
        lastErrorKind = "";
        setState({ status: "synced", error: "", count: records.length });
        return { ok: true, count: records.length };
      } catch (error) {
        console.error("[K-Labs Studio] Manual sync-to-cloud failed:", error);
        const message = supabaseErrorMessage(error, "Could not upload your component library to Supabase. Local data is unchanged.");
        lastErrorKind = "push";
        setState({ status: "error", error: message });
        return { ok: false, error: message };
      }
    },
    async countCloudComponents() {
      if (!currentUserId || !client()) return null;
      const { count, error } = await client().from("components").select("client_id", { count: "exact", head: true }).eq("user_id", currentUserId);
      if (error) return null;
      return typeof count === "number" ? count : null;
    },
  };
})();
