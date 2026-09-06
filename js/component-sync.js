// Component library ↔ Supabase sync.
// - js/ui.js keys the component library/taxonomy local storage per signed-in account: signed-out/never-
//   migrated usage stays on the original bare "anonymous" key forever (never deleted); each authenticated
//   account gets its own `:<uid>` suffixed key.
// - The FIRST authenticated account ever to encounter a populated anonymous library permanently claims it
//   via a durable owner marker (klabs-component-library-anonymous-owner) and gets a one-time, non-destructive
//   COPY of it into their own namespace, so it stays fully visible/editable locally even if they choose NOT
//   NOW. Ownership is never re-derived from "whoever is currently signed in" - once claimed, no other account
//   is ever offered, shown, or able to upload that legacy data, even after the owner signs out.
// - Once an account is "linked" (its own first migration/sync completed), Supabase is that account's shared
//   signed-in source of truth; its own local namespace is refreshed from it on login and kept in sync via
//   debounced writes.
// - No realtime subscriptions: refresh-on-load/login is the sync model (per project brief).
(function () {
  const MIGRATION_FLAG_PREFIX = "klabs-component-cloud-linked";
  const KNOWN_IDS_PREFIX = "klabs-component-cloud-known-ids";
  const ANONYMOUS_OWNER_KEY = "klabs-component-library-anonymous-owner";
  const RECONCILE_DEBOUNCE_MS = 700;

  let currentUserId = "";
  let syncState = { status: "local", error: "", count: 0 };
  let reconcileTimer = null;
  let taxonomyTimer = null;
  let reconcileInFlight = false;
  let reconcileQueuedAgain = false;
  let lastErrorKind = ""; // 'push' | 'pull' - decides what Retry actually resumes

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
  function anonymousLibraryOwner() {
    return String(window.Store.get(ANONYMOUS_OWNER_KEY, "") || "");
  }
  // Runs once ever, the first time ANY authenticated account encounters a populated anonymous library:
  // permanently records that account as its owner, then copies (never moves) the anonymous records/taxonomy
  // into that account's own namespace so choosing NOT NOW still leaves a fully usable local library. Once an
  // owner is recorded, this is a guaranteed no-op for every other account, forever - the anonymous data is
  // never read, copied or shown to anyone else again.
  function claimAnonymousLibraryIfNeeded() {
    if (anonymousLibraryOwner()) return;
    const anonymousRecords = window.KLABS_UI?.readAnonymousComponentLibraryRecords?.() || [];
    const anonymousTaxonomy = window.KLABS_UI?.readAnonymousComponentTaxonomy?.() || { categories: [], suppliers: [] };
    const hasAnonymousData = anonymousRecords.length > 0 || anonymousTaxonomy.categories.length > 0 || anonymousTaxonomy.suppliers.length > 0;
    if (!hasAnonymousData) return;
    window.Store.set(ANONYMOUS_OWNER_KEY, currentUserId);
    if (anonymousRecords.length > 0 && window.componentLibraryRecords().length === 0) {
      window.saveComponentLibraryRecords(anonymousRecords);
    }
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

  async function fetchCloudComponents() {
    const { data, error } = await client().from("components").select("*").eq("user_id", currentUserId);
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }
  async function fetchCloudTaxonomy() {
    const { data, error } = await client().from("component_taxonomy").select("*").eq("user_id", currentUserId).maybeSingle();
    if (error) throw error;
    return data || null;
  }
  async function upsertCloudComponents(records) {
    if (!records.length) return;
    const rows = records.map(recordToRow);
    const { error } = await client().from("components").upsert(rows, { onConflict: "user_id,client_id" });
    if (error) throw error;
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

  // Full-reconcile push: upserts every current local record and deletes any cloud record whose id is no
  // longer present locally. Idempotent by design, so it is safe to call repeatedly/after a failed attempt.
  async function reconcileNow() {
    if (!currentUserId || !isLinked()) return;
    if (reconcileInFlight) {
      reconcileQueuedAgain = true;
      return;
    }
    reconcileInFlight = true;
    setState({ status: "syncing", error: "" });
    try {
      const localRecords = window.componentLibraryRecords().filter((record) => record.id);
      const knownIds = getKnownCloudIds();
      const localIds = new Set(localRecords.map((record) => record.id));
      const toDelete = Array.from(knownIds).filter((id) => !localIds.has(id));
      if (toDelete.length) await deleteCloudComponents(toDelete);
      if (localRecords.length) await upsertCloudComponents(localRecords);
      const verify = await verifyCloudComponents(Array.from(localIds));
      if (!verify.ok) throw new Error(`Verification failed: ${verify.missing.length} component(s) missing after upload.`);
      setKnownCloudIds(localIds);
      lastErrorKind = "";
      setState({ status: "synced", error: "", count: localRecords.length });
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
    claimAnonymousLibraryIfNeeded();
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
    const linked = isLinked();

    if (cloudRows.length === 0 && !linked) {
      const ownRecords = window.componentLibraryRecords();
      if (ownRecords.length === 0) {
        window.Store.set(migrationFlagKey(), true);
        setKnownCloudIds(new Set());
        setState({ status: "synced", error: "", count: 0 });
        return;
      }
      // First login with local data in this account's own namespace and an empty cloud library: needs an
      // explicit user decision before anything is uploaded.
      setState({ status: "migration-pending", error: "", count: ownRecords.length });
      window.KLABS_UI?.onComponentLibraryMigrationPending?.(ownRecords.length);
      return;
    }

    // A previous local edit failed to push (offline/RLS/network). Never let a pull-based resync below
    // silently discard it by overwriting local with older cloud data - push it first instead.
    if (lastErrorKind === "push") {
      try {
        await reconcileNow();
      } catch (error) {
        console.error("[K-Labs Studio] Could not resume a pending local component change:", error);
      }
      return;
    }

    if (cloudRows.length === 0 && linked) {
      // Previously linked but cloud now reads empty: never treat this as "erase local". Self-heal by
      // re-pushing this account's own cached namespace instead of ever wiping it.
      const ownRecords = window.componentLibraryRecords();
      if (ownRecords.length > 0) {
        try {
          await reconcileNow();
        } catch (error) {
          console.error("[K-Labs Studio] Could not restore cloud component library from local cache:", error);
          setState({ status: "error", error: "Your account library looks empty and re-sync failed. Local data is safe." });
        }
      } else {
        setState({ status: "synced", error: "", count: 0 });
      }
      return;
    }

    // Cloud has data: cloud is the shared signed-in source of truth for a linked account.
    const cloudRecords = cloudRows.map(rowToRecord);
    window.saveComponentLibraryRecords(cloudRecords);
    if (cloudTaxonomyRow && cloudTaxonomyRow.taxonomy) {
      window.KLABS_UI?.applyCloudComponentTaxonomy?.(cloudTaxonomyRow.taxonomy);
    } else {
      try {
        await upsertCloudTaxonomy(window.ensureStudioComponentTaxonomyLoaded());
      } catch (error) {
        console.error("[K-Labs Studio] Could not push taxonomy to Supabase:", error);
      }
    }
    window.Store.set(migrationFlagKey(), true);
    setKnownCloudIds(new Set(cloudRows.map((row) => String(row.client_id))));
    setState({ status: "synced", error: "", count: cloudRecords.length });
    window.KLABS_UI?.refreshComponentLibraryViews?.();
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
        return;
      }
      runMigrationOrSync().catch((error) => {
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
        const ownRecords = window.componentLibraryRecords();
        const deduped = dedupeLocalRecords(ownRecords);
        if (deduped.length !== ownRecords.length) window.saveComponentLibraryRecords(deduped);
        const withIds = window.componentLibraryRecords();
        await upsertCloudComponents(withIds);
        await upsertCloudTaxonomy(window.ensureStudioComponentTaxonomyLoaded());
        const verify = await verifyCloudComponents(withIds.map((record) => record.id));
        if (!verify.ok) {
          throw new Error(`Upload verification failed: ${verify.missing.length} of ${withIds.length} components could not be confirmed in your account.`);
        }
        window.Store.set(migrationFlagKey(), true);
        setKnownCloudIds(new Set(withIds.map((record) => record.id)));
        setState({ status: "synced", error: "", count: withIds.length });
        return { ok: true, count: withIds.length };
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
      if (lastErrorKind === "push") {
        reconcileNow().catch((error) => console.error("[K-Labs Studio] Component library sync retry failed:", error));
        return;
      }
      runMigrationOrSync().catch((error) => console.error("[K-Labs Studio] Component library sync retry failed:", error));
    },
    getState() {
      return syncState;
    },
  };
})();
