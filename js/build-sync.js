// Account-scoped build synchronisation. Build IDs, not build numbers, identify records.
(function () {
  let userId = "";
  let generation = 0;
  let timer = null;
  let runner = { running: null, requested: false };
  let status = "local";
  let mode = "unknown";
  let sequence = 0;

  const journal = () => window.KLABS_BUILD_SYNC_JOURNAL;
  const transport = () => window.KLABS_GUARDED_BUILD_TRANSPORT;
  const client = () => window.KLABS_SUPABASE_CLIENT;
  const canWrite = () => typeof window.KLABS_CAN_WRITE === "function"
    ? window.KLABS_CAN_WRITE() : window.KLABS_ACCESS_STATE?.can_write !== false;
  const accountMatches = () => window.KLABS_ACCOUNT_ID === undefined || String(window.KLABS_ACCOUNT_ID || "") === userId;
  const current = (context) => context.userId === userId && context.generation === generation && accountMatches()
    && (!window.KLABS_BUILD_TAB_LOCK || window.KLABS_BUILD_TAB_LOCK.owns(context.userId));
  const context = () => ({ userId, generation, isCurrent() { return current(this); } });
  const records = () => (window.savedBuildRecords?.() || []).filter((record) => record && record.id);
  const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));

  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") {
      return Object.keys(value).sort().reduce((result, key) => {
        result[key] = canonical(value[key]);
        return result;
      }, {});
    }
    return value;
  }
  const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
  function setStatus(value) {
    status = value;
    window.KLABS_UI?.onBuildSyncStatus?.(value);
  }
  function store(ctx, state) {
    if (!current(ctx)) throw new Error("The signed-in account changed.");
    journal().write(ctx.userId, state);
  }
  function refreshStatus(state) {
    if (Object.keys(state.conflicts).length) setStatus("error");
    else if (Object.keys(state.pending).length) setStatus("pending");
    else setStatus(canWrite() ? "synced" : "local");
  }
  async function detectMode(ctx) {
    const { data, error } = await client().rpc("klabs_build_guard_version");
    if (!current(ctx)) throw new Error("The signed-in account changed.");
    const state = journal().read(ctx.userId);
    if (!error && data === 2) {
      if (!state.guardSeen) {
        state.guardSeen = true;
        store(ctx, state);
      }
      mode = "guarded";
    } else if (error?.code === "PGRST202" && !state.guardSeen) {
      mode = "compatibility";
    } else {
      throw new Error("Could not verify the build protection mode. Changes remain on this device.");
    }
    window.KLABS_UI?.onBuildSyncMode?.(mode);
    return mode;
  }
  function rowRecord(row) {
    const record = { ...(row.payload || {}), id: String(row.client_id) };
    if (!record.buildNumber && row.build_number) record.buildNumber = String(row.build_number);
    return record;
  }
  function putLocal(ctx, record, id) {
    if (!current(ctx)) throw new Error("The signed-in account changed.");
    const list = records().filter((item) => String(item.id) !== id);
    if (record) list.unshift(record);
    const old = window.KLABS_SYNC_HYDRATION;
    window.KLABS_SYNC_HYDRATION = true;
    try {
      if (window.saveBuildRecords(list) === false) throw new Error("Could not save the local build.");
    }
    finally { window.KLABS_SYNC_HYDRATION = old; }
    window.KLABS_UI?.refreshBuildViews?.();
  }
  function addConflict(state, id, local, cloud, revision, reason) {
    const old = state.conflicts[id];
    const history = old?.history || [];
    if (old && (!equal(old.local, local) || !equal(old.cloud, cloud) || old.revision !== revision)) {
      history.push({ local: old.local, cloud: old.cloud, revision: old.revision });
    }
    state.conflicts[id] = { id, local: clone(local), cloud: clone(cloud), revision: revision || null,
      operation: state.pending[id]?.kind || "save", reason, history };
  }
  async function fetchRows(ctx) {
    const rows = [];
    const seen = new Set();
    let expected = null;
    do {
      const { data, error, count } = await client().from("builds").select("*", { count: "exact" })
        .eq("user_id", ctx.userId).order("client_id", { ascending: true })
        .range(rows.length, rows.length + 499);
      if (error) throw new Error(error.message || "Could not read cloud builds.");
      if (!current(ctx)) throw new Error("The signed-in account changed.");
      if (!Array.isArray(data) || !Number.isInteger(count) || (expected !== null && expected !== count)) {
        throw new Error("The cloud build list changed or is incomplete. Try again.");
      }
      expected = count;
      for (const row of data) {
        const id = String(row.client_id || "");
        if (!id || seen.has(id)) throw new Error("The cloud build list changed or contains duplicate IDs. Try again.");
        seen.add(id);
        rows.push(row);
      }
      if ((!data.length && rows.length < expected) || rows.length > expected) {
        throw new Error("The cloud build list is incomplete. Try again.");
      }
    } while (rows.length < expected);
    return rows;
  }
  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; run(); }, 700);
  }
  async function reconcile(ctx) {
    const rows = await fetchRows(ctx);
    let state = journal().read(ctx.userId);
    const local = new Map(records().map((record) => [String(record.id), record]));
    const cloud = new Map(rows.map((row) => [String(row.client_id), row]));
    const ids = new Set([...local.keys(), ...cloud.keys(), ...Object.keys(state.pending), ...Object.keys(state.baselines)]);
    const hydrate = [];
    for (const id of ids) {
      const row = cloud.get(id);
      const remote = row ? rowRecord(row) : null;
      const here = local.get(id) || null;
      const base = state.baselines[id];
      let pending = state.pending[id];
      if (pending?.kind === "delete-intent") {
        if (here) {
          if (pending.previous) state.pending[id] = pending.previous;
          else delete state.pending[id];
          if (pending.previousConflict) state.conflicts[id] = pending.previousConflict;
          else delete state.conflicts[id];
          pending = state.pending[id];
        } else {
          pending = state.pending[id] = { kind: "delete", record: pending.record, token: pending.token };
        }
      }
      if (!pending && here && (!base || !equal(here, base.payload))) {
        pending = state.pending[id] = { kind: "save", record: clone(here), token: `${Date.now()}-${++sequence}` };
      }
      if (state.conflicts[id]) {
        addConflict(state, id, pending?.record || here, remote, row?.updated_at, "Versions require review.");
        continue;
      }
      if (pending) {
        if (pending.kind === "delete" && here) putLocal(ctx, null, id);
        if (pending.kind === "save" && remote && equal(pending.record, remote)) {
          state.baselines[id] = { revision: row.updated_at, payload: clone(remote) };
          delete state.pending[id];
        } else if (pending.kind === "delete" && !remote) {
          addConflict(state, id, pending.record, null, null, "The cloud build is absent. Review the deletion.");
        } else if ((base && (!row || row.updated_at !== base.revision || !equal(remote, base.payload))) || (!base && row)) {
          addConflict(state, id, pending.record || here, remote, row?.updated_at,
            "The cloud version changed or has no verified common baseline.");
        }
      } else if (row) {
        if (here && base && !equal(here, remote) && window.KLABS_UI?.isBuildOpen?.(id)) {
          addConflict(state, id, here, remote, row.updated_at, "This build is open. Close it before reviewing the cloud version.");
          continue;
        }
        if (here && base && !equal(here, remote)) {
          state.archive.push({ id, local: clone(here), cloud: clone(remote), revision: row.updated_at,
            reason: "Cloud update", archivedAt: new Date().toISOString() });
        }
        state.baselines[id] = { revision: row.updated_at, payload: clone(remote) };
        if (!equal(here, remote)) hydrate.push([id, remote]);
      } else if (base) {
        if (here) addConflict(state, id, here, null, null, "The cloud build was deleted.");
        else delete state.baselines[id];
      }
    }
    store(ctx, state);
    for (const [id, record] of hydrate) putLocal(ctx, record, id);
    return state;
  }
  async function flush(ctx) {
    let state = await reconcile(ctx);
    if (!canWrite()) { refreshStatus(state); return; }
    const activeMode = await detectMode(ctx);
    if (!current(ctx) || !canWrite()) return;
    for (const id of Object.keys(state.pending)) {
      if (!current(ctx) || !canWrite()) return;
      state = journal().read(ctx.userId);
      const entry = state.pending[id];
      if (!entry || state.conflicts[id]) continue;
      const base = state.baselines[id];
      if (entry.kind === "delete" && !base) throw new Error("Deletion has no verified cloud revision.");
      try {
        let result;
        if (entry.kind === "delete") await transport().remove(client(), ctx, id, base.revision, activeMode);
        else result = await transport().save(client(), ctx, entry.record, base?.revision || null, activeMode);
        if (!current(ctx)) return;
        state = journal().read(ctx.userId);
        if (entry.kind === "delete") delete state.baselines[id];
        else state.baselines[id] = { revision: result.updated_at, payload: clone(rowRecord(result)) };
        if (state.pending[id]?.token === entry.token) delete state.pending[id];
        store(ctx, state);
      } catch (error) {
        if (!current(ctx)) return;
        console.error("[K-Labs Studio] Build sync failed:", error);
        try { await reconcile(ctx); }
        catch (readError) { console.error("[K-Labs Studio] Could not check cloud versions:", readError); }
        if (current(ctx)) setStatus("error");
        return;
      }
    }
    if (current(ctx)) refreshStatus(journal().read(ctx.userId));
  }
  async function run() {
    if (!userId) return;
    const active = runner;
    if (active.running) {
      active.requested = true;
      await active.running;
      if (active === runner && active.requested) return run();
      return;
    }
    const ctx = context();
    active.requested = false;
    active.running = (async () => {
      try { await flush(ctx); }
      catch (error) {
        console.error("[K-Labs Studio] Build sync failed:", error);
        if (current(ctx)) setStatus("error");
      }
    })();
    await active.running;
    active.running = null;
    if (active === runner && active.requested) {
      active.requested = false;
      schedule();
    }
  }
  const financialKey = (account) => `klabs-financial-operation:${account}`;
  function pendingFinancial() {
    if (!userId) return null;
    const raw = window.localStorage.getItem(financialKey(userId));
    if (!raw) return null;
    const operation = JSON.parse(raw);
    if (!operation || operation.account !== userId || !operation.id || !operation.buildId ||
        !operation.revision || !operation.kind || !operation.data) {
      throw new Error("The pending financial operation is invalid. No new transaction was submitted.");
    }
    return operation;
  }
  async function financialOperation(buildId, kind, data) {
    if (!userId || !accountMatches() || !canWrite() || window.navigator?.onLine === false ||
        !window.crypto?.randomUUID || !client()) {
      throw new Error("Connect and sign in to record financial transactions.");
    }
    const ctx = context();
    if (!current(ctx)) throw new Error("This tab does not own the account lock.");
    let operation = pendingFinancial();
    if (operation) {
      if (operation.buildId !== String(buildId)) {
        throw new Error("A previous financial operation needs confirmation on another build.");
      }
      if (kind !== operation.kind || !equal(data, operation.data)) {
        throw new Error("Retry the previous unconfirmed financial operation before starting another.");
      }
    } else {
      await run();
      if (!current(ctx) || mode !== "guarded" || status !== "synced") {
        throw new Error("Synchronise and resolve build conflicts before recording a financial transaction.");
      }
      const state = journal().read(ctx.userId);
      const id = String(buildId);
      const base = state.baselines[id];
      const local = records().find(item => String(item.id) === id);
      if (!base?.revision || !local || !equal(local, base.payload) || state.pending[id] || state.conflicts[id]) {
        throw new Error("Save and synchronise this build before recording a financial transaction.");
      }
      operation = { account: ctx.userId, id: window.crypto.randomUUID(), buildId: id,
        revision: base.revision, kind, data: clone(data) };
      window.localStorage.setItem(financialKey(ctx.userId), JSON.stringify(operation));
    }
    const wasUncertain = operation.uncertain === true;
    operation.uncertain = true;
    window.localStorage.setItem(financialKey(ctx.userId), JSON.stringify(operation));
    let response;
    try {
      response = await client().rpc("klabs_financial_operation", {
        p_build_id: operation.buildId, p_revision: operation.revision,
        p_operation_id: operation.id, p_kind: operation.kind, p_data: operation.data,
      });
    } catch (error) {
      throw new Error("The result is unconfirmed. Retry the pending financial operation before making another payment.", { cause: error });
    }
    const { data: result, error } = response;
    if (error) {
      if (!wasUncertain && /^(P0001|22[0-9A-Z]{3}|23[0-9A-Z]{3}|42501|PGRST202)$/.test(error.code || "")) {
        window.localStorage.removeItem(financialKey(ctx.userId));
        throw new Error(error.message || "The financial operation was rejected.");
      }
      throw new Error("The result is unconfirmed. Retry the pending financial operation before making another payment.");
    }
    if (!result || result.user_id !== ctx.userId || String(result.client_id) !== operation.buildId ||
        !result.updated_at || !result.payload) {
      throw new Error("The server response could not be verified. Retry the pending financial operation.");
    }
    if (!current(ctx)) throw new Error("The account changed. Retry the pending financial operation in the original account.");
    const latest = await client().from("builds").select("*").eq("user_id", ctx.userId)
      .eq("client_id", operation.buildId);
    if (latest.error || !Array.isArray(latest.data) || latest.data.length !== 1) {
      throw new Error("The operation was acknowledged, but the latest build could not be verified. Retry it.");
    }
    if (!current(ctx)) throw new Error("The account changed. Retry the pending financial operation in the original account.");
    const state = journal().read(ctx.userId);
    const base = state.baselines[operation.buildId];
    const local = records().find(item => String(item.id) === operation.buildId) || null;
    const remoteRow = latest.data[0];
    const remote = rowRecord(remoteRow);
    if (state.pending[operation.buildId] || state.conflicts[operation.buildId] ||
        !base || base.revision !== operation.revision || !equal(local, base.payload) ||
        remoteRow.updated_at !== result.updated_at) {
      addConflict(state, operation.buildId, local, remote, remoteRow.updated_at,
        "A financial operation was acknowledged while this build changed. Review both versions.");
      store(ctx, state);
      setStatus("error");
      window.localStorage.removeItem(financialKey(ctx.userId));
      return { operation, record: remote, conflict: true };
    }
    state.baselines[operation.buildId] = { revision: remoteRow.updated_at, payload: clone(remote) };
    store(ctx, state);
    putLocal(ctx, remote, operation.buildId);
    window.localStorage.removeItem(financialKey(ctx.userId));
    refreshStatus(state);
    return { operation, record: remote, conflict: false };
  }
  function enqueue(kind, record) {
    if (!userId || !canWrite()) return false;
    if (!accountMatches()) {
      setStatus("error");
      throw new Error("The signed-in account changed. The build was not synchronised.");
    }
    if (!record?.id) throw new Error("A stable build ID and complete record are required.");
    const ctx = context();
    try {
      const state = journal().read(userId);
      const id = String(record.id);
      const previousPending = state.pending[id];
      const previousConflict = state.conflicts[id];
      state.pending[id] = { kind, record: clone(record), token: `${Date.now()}-${++sequence}` };
      if (kind === "delete-intent") {
        state.pending[id].previous = clone(previousPending);
        state.pending[id].previousConflict = clone(previousConflict);
      }
      if (kind !== "delete-intent" && state.conflicts[id]) {
        addConflict(state, id, record, state.conflicts[id].cloud, state.conflicts[id].revision,
          "Local changes require review.");
      }
      store(ctx, state);
      if (status !== "error") setStatus("pending");
      if (kind !== "delete-intent") schedule();
      return true;
    } catch (error) {
      console.error("[K-Labs Studio] Could not preserve pending build change:", error);
      setStatus("error");
      throw error;
    }
  }
  function confirmDelete(id) {
    if (!userId || !canWrite()) return;
    const ctx = context();
    const state = journal().read(userId);
    const entry = state.pending[id];
    if (!entry || entry.kind !== "delete-intent") throw new Error("The deletion was not safely prepared.");
    state.pending[id] = { kind: "delete", record: entry.record, token: entry.token };
    if (state.conflicts[id]) addConflict(state, id, entry.record, state.conflicts[id].cloud,
      state.conflicts[id].revision, "Deletion requires review.");
    store(ctx, state);
    schedule();
  }
  async function resolve(id, choice, expectedRevision) {
    if (!canWrite()) throw new Error("This account is read-only.");
    if (choice !== "local" && choice !== "cloud") throw new Error("Choose a version to keep.");
    if (window.KLABS_UI?.isBuildOpen?.(String(id))) throw new Error("Open another build before resolving this conflict.");
    const ctx = context();
    const activeMode = await detectMode(ctx);
    if (!current(ctx) || !canWrite()) throw new Error("The account or write permission changed.");
    const rows = await fetchRows(ctx);
    const row = rows.find((item) => String(item.client_id) === String(id));
    let state = journal().read(ctx.userId);
    const conflict = state.conflicts[id];
    if (!conflict) throw new Error("This conflict is no longer available.");
    if ((row?.updated_at || null) !== expectedRevision || conflict.revision !== expectedRevision) {
      addConflict(state, id, conflict.local, row ? rowRecord(row) : null, row?.updated_at, "Cloud version changed. Review it again.");
      store(ctx, state);
      throw new Error("The cloud version changed. Review both versions again.");
    }
    state.archive.push({ ...clone(conflict), resolvedAt: new Date().toISOString(), choice });
    store(ctx, state);
    const pending = state.pending[id];
    if (choice === "local") {
      if (pending?.kind === "delete") {
        if (row) await transport().remove(client(), ctx, id, row.updated_at, activeMode);
      } else {
        if (!conflict.local) throw new Error("There is no local version to save.");
        const saved = await transport().save(client(), ctx, conflict.local, row?.updated_at || null, activeMode);
        row && (row.updated_at = saved.updated_at);
        if (!row) rows.push(saved);
      }
    }
    if (!current(ctx)) throw new Error("The signed-in account changed.");
    if (window.KLABS_UI?.isBuildOpen?.(String(id))) throw new Error("This build was opened during review. Close it and review again.");
    state = journal().read(ctx.userId);
    if (!equal(state.conflicts[id], conflict) || state.pending[id]?.token !== pending?.token) {
      throw new Error("The local version changed during review. Review it again.");
    }
    const kept = choice === "cloud" ? (row ? rowRecord(row) : null) :
      (pending?.kind === "delete" ? null : conflict.local);
    const savedRow = choice === "local" && !row ? rows[rows.length - 1] : row;
    if (kept && savedRow) state.baselines[id] = { revision: savedRow.updated_at, payload: clone(kept) };
    else delete state.baselines[id];
    putLocal(ctx, kept, String(id));
    delete state.pending[id];
    delete state.conflicts[id];
    store(ctx, state);
    refreshStatus(state);
  }
  window.KLABS_BUILD_SYNC = {
    onAuthStateChanged(session) {
      const next = session?.user?.id || "";
      if (next !== userId) {
        if (timer) clearTimeout(timer);
        timer = null;
        userId = next;
        generation++;
        mode = "unknown";
        window.KLABS_UI?.onBuildSyncMode?.(mode);
        runner = { running: null, requested: false };
      }
      if (!userId) { setStatus("local"); return Promise.resolve(); }
      setStatus("pending");
      return run();
    },
    getStatus: () => status,
    getMode: () => mode,
    pendingFinancial,
    financialOperation,
    retryFinancial() {
      const operation = pendingFinancial();
      if (!operation) throw new Error("There is no pending financial operation.");
      return financialOperation(operation.buildId, operation.kind, operation.data);
    },
    notifyBuildSaved: (record) => enqueue("save", record),
    notifyBuildDeleted: (record) => enqueue("delete-intent", record),
    confirmBuildDeleted: confirmDelete,
    getConflicts() { return userId ? clone(journal().read(userId).conflicts) : {}; },
    resolveConflict: resolve,
    retry: run,
  };
  window.addEventListener?.("online", () => { if (userId) run(); });
})();
