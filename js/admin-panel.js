(function () {
  const PAGE_SIZE = 50;
  const state = {
    owner: false,
    userId: "",
    builders: [],
    selected: null,
    offset: 0,
    loading: false,
    hasMore: false
  };

  const byId = (id) => document.getElementById(id);
  const accessCard = byId("settingsAdminEntry");
  const adminScreen = byId("adminAccessScreen");

  function setText(id, value) {
    const element = byId(id);
    if (element) element.textContent = value || "";
  }

  function setStatus(id, value) {
    setText(id, value);
  }

  function supabase() {
    const client = window.KLABS_SUPABASE_CLIENT;
    if (!client) throw new Error("The account service is unavailable.");
    return client;
  }

  function formatDate(value, withTime) {
    if (!value) return "Not set";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "Unavailable";
    return new Intl.DateTimeFormat(undefined, withTime
      ? { dateStyle: "medium", timeStyle: "short" }
      : { dateStyle: "medium" }).format(date);
  }

  function endOfSelectedDay(value) {
    if (!value) return null;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day, 23, 59, 59, 999);
    if (!Number.isFinite(date.getTime())) throw new Error("Choose a valid expiry date.");
    return date.toISOString();
  }

  function statusLabel(status) {
    return ({
      trial_eligible: "Trial eligible",
      trial: "Active trial",
      expired: "Expired",
      grandfathered: "Grandfathered",
      complimentary: "Complimentary",
      paid: "Paid access"
    })[status] || "Unavailable";
  }

  function hideAdmin() {
    state.owner = false;
    state.userId = "";
    state.builders = [];
    state.selected = null;
    state.offset = 0;
    state.hasMore = false;
    if (accessCard) accessCard.hidden = true;
    if (adminScreen) adminScreen.hidden = true;
    byId("adminBuilderList")?.replaceChildren();
    byId("adminBuilderDetail")?.setAttribute("hidden", "");
    setText("adminBuilderEmail", "");
    setText("adminBuilderStatus", "");
    byId("adminBuilderDates")?.replaceChildren();
    byId("adminAuditList")?.replaceChildren();
    [
      "adminBuilderSearch", "adminComplimentaryExpiry", "adminComplimentaryReason",
      "adminTrialExpiry", "adminTrialReason", "adminRevokeReason"
    ].forEach((id) => {
      if (byId(id)) byId(id).value = "";
    });
    ["adminAccessError", "adminBuilderListStatus", "adminAuditStatus", "adminChangeStatus"].forEach((id) => setStatus(id, ""));
    if (document.querySelector(".screen.active")?.id === "adminAccessScreen") {
      window.KLABS_NAV?.goScreen("settingsScreen");
    }
  }

  async function onAuthStateChanged(session) {
    const nextUserId = session?.user?.id || "";
    hideAdmin();
    if (!nextUserId) return;
    state.userId = nextUserId;
    try {
      const { data, error } = await supabase().rpc("klabs_is_owner");
      if (error) throw error;
      if (state.userId !== nextUserId) return;
      state.owner = data === true;
      if (accessCard) accessCard.hidden = !state.owner;
      if (adminScreen) adminScreen.hidden = !state.owner;
    } catch (error) {
      if (state.userId !== nextUserId) return;
      console.error("[K-Labs Studio] Owner access check failed:", error);
      hideAdmin();
    }
  }

  function builderSummary(builder) {
    const date = builder.access_state === "trial"
      ? `Trial ends ${formatDate(builder.trial_expires_at, true)}`
      : ["complimentary", "paid"].includes(builder.access_state) && builder.access_expires_at
        ? `Access ends ${formatDate(builder.access_expires_at, true)}`
        : builder.access_state === "trial_eligible" ? "No trial started" : "No expiry";
    return `${statusLabel(builder.access_state)} · ${date}`;
  }

  function renderBuilders(append) {
    const list = byId("adminBuilderList");
    if (!list) return;
    if (!append) list.replaceChildren();
    for (const builder of state.builders.slice(append ? state.offset - PAGE_SIZE : 0)) {
      const wrapper = document.createElement("div");
      wrapper.setAttribute("role", "listitem");
      const item = document.createElement("button");
      item.type = "button";
      item.className = "admin-builder-row";
      item.setAttribute("aria-pressed", String(state.selected?.builder_user_id === builder.builder_user_id));
      item.dataset.builderId = builder.builder_user_id;

      const email = document.createElement("strong");
      email.className = "admin-builder-row__email";
      email.textContent = builder.email || "Email unavailable";
      const summary = document.createElement("span");
      summary.className = "admin-builder-row__summary";
      summary.textContent = builderSummary(builder);
      const created = document.createElement("small");
      created.textContent = `Registered ${formatDate(builder.account_created_at, false)}`;
      item.append(email, summary, created);
      item.addEventListener("click", () => selectBuilder(builder));
      wrapper.append(item);
      list.append(wrapper);
    }
    const more = byId("adminLoadMoreBtn");
    if (more) more.hidden = !state.hasMore;
    setStatus("adminBuilderListStatus", `${state.builders.length} builder${state.builders.length === 1 ? "" : "s"} loaded.`);
  }

  async function loadBuilders(reset) {
    if (!state.owner || state.loading) return;
    if (reset) {
      state.offset = 0;
      state.builders = [];
      state.hasMore = false;
    }
    state.loading = true;
    const requestUserId = state.userId;
    setStatus("adminAccessError", "");
    setStatus("adminBuilderListStatus", "Loading registered builders...");
    try {
      const search = byId("adminBuilderSearch")?.value.trim() || "";
      const status = byId("adminBuilderStatusFilter")?.value || "all";
      const { data, error } = await supabase().rpc("admin_list_builders", {
        p_search: search,
        p_status: status,
        p_limit: PAGE_SIZE,
        p_offset: state.offset
      });
      if (error) throw error;
      if (!state.owner || state.userId !== requestUserId) return;
      const batch = Array.isArray(data) ? data : [];
      state.builders = reset ? batch : state.builders.concat(batch);
      state.offset += batch.length;
      state.hasMore = batch.length === PAGE_SIZE;
      renderBuilders(!reset);
      if (state.selected) {
        const refreshed = state.builders.find((item) => item.builder_user_id === state.selected.builder_user_id);
        if (refreshed) await selectBuilder(refreshed);
        else clearSelectedBuilder();
      }
    } catch (error) {
      if (!state.owner || state.userId !== requestUserId) return;
      setStatus("adminAccessError", error?.message || "Could not load registered builders.");
      console.error("[K-Labs Studio] Builder access list failed:", error);
    } finally {
      state.loading = false;
    }
  }

  function appendDefinition(list, term, detail) {
    const row = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = term;
    dd.textContent = detail;
    row.append(dt, dd);
    list.append(row);
  }

  function renderBuilderDetail(builder) {
    state.selected = builder;
    byId("adminBuilderList")?.querySelectorAll(".admin-builder-row").forEach((item) => {
      item.setAttribute("aria-pressed", String(item.dataset.builderId === builder.builder_user_id));
    });
    byId("adminBuilderDetail").hidden = false;
    setText("adminBuilderEmail", builder.email || "Email unavailable");
    const badge = byId("adminBuilderStatus");
    badge.textContent = statusLabel(builder.access_state);
    badge.dataset.status = builder.access_state || "unknown";

    const dates = byId("adminBuilderDates");
    dates.replaceChildren();
    appendDefinition(dates, "Registered", formatDate(builder.account_created_at, true));
    appendDefinition(dates, "Effective access", builder.can_write ? "Can make changes" : "Read-only");
    appendDefinition(dates, "Trial eligibility", builder.trial_available ? "Available; not started" : "Not available");
    appendDefinition(dates, "Trial started", formatDate(builder.trial_started_at, true));
    appendDefinition(dates, "Trial expires", formatDate(builder.trial_expires_at, true));
    appendDefinition(dates, "Access expires", formatDate(builder.access_expires_at, true));

    const ownerOrPaid = builder.builder_user_id === state.userId
      || ["grandfathered", "paid"].includes(builder.access_state);
    byId("adminComplimentaryControls").hidden = ownerOrPaid;
    byId("adminTrialControls").hidden = builder.access_state !== "trial" || !builder.can_write;
    byId("adminRevokeControls").hidden = builder.access_state !== "complimentary";
    setStatus("adminChangeStatus", "");
  }

  function clearSelectedBuilder() {
    state.selected = null;
    byId("adminBuilderDetail").hidden = true;
    byId("adminAuditList").replaceChildren();
    setStatus("adminAuditStatus", "");
  }

  async function loadAudit(builderId) {
    const list = byId("adminAuditList");
    const requestUserId = state.userId;
    list.replaceChildren();
    setStatus("adminAuditStatus", "Loading access history...");
    try {
      const { data, error } = await supabase().rpc("admin_list_access_audit", {
        p_target_user_id: builderId
      });
      if (error) throw error;
      if (!state.owner || state.userId !== requestUserId || state.selected?.builder_user_id !== builderId) return;
      const rows = Array.isArray(data) ? data : [];
      for (const row of rows) {
        const item = document.createElement("li");
        const title = document.createElement("strong");
        title.textContent = `${String(row.action || "").replaceAll("_", " ")} · ${formatDate(row.created_at, true)}`;
        const reason = document.createElement("p");
        reason.textContent = row.reason || "No reason recorded";
        const actor = document.createElement("small");
        actor.textContent = row.admin_email ? `By ${row.admin_email}` : "Administrator account unavailable";
        item.append(title, reason, actor);
        list.append(item);
      }
      setStatus("adminAuditStatus", rows.length ? `${rows.length} most recent change${rows.length === 1 ? "" : "s"}.` : "No access changes recorded.");
    } catch (error) {
      if (!state.owner || state.userId !== requestUserId || state.selected?.builder_user_id !== builderId) return;
      setStatus("adminAuditStatus", error?.message || "Could not load access history.");
      console.error("[K-Labs Studio] Access audit history failed:", error);
    }
  }

  async function selectBuilder(builder, loadHistory) {
    renderBuilderDetail(builder);
    if (loadHistory !== false) await loadAudit(builder.builder_user_id);
  }

  async function performChange(button, rpcName, args, confirmation) {
    const builder = state.selected;
    const requestUserId = state.userId;
    if (!state.owner || !builder) {
      setStatus("adminChangeStatus", "Select a builder account first.");
      return;
    }
    if (!window.confirm(confirmation)) return;
    button.disabled = true;
    setStatus("adminChangeStatus", "Saving access change...");
    setStatus("adminAccessError", "");
    try {
      const { error } = await supabase().rpc(rpcName, args(builder));
      if (error) throw error;
      if (!state.owner || state.userId !== requestUserId) return;
      await loadBuilders(true);
      if (state.owner && state.userId === requestUserId) {
        setStatus("adminChangeStatus", "Access updated and recorded in the audit log.");
      }
    } catch (error) {
      if (!state.owner || state.userId !== requestUserId) return;
      setStatus("adminChangeStatus", error?.message || "Could not update access.");
      console.error("[K-Labs Studio] Access change failed:", error);
    } finally {
      button.disabled = false;
    }
  }

  function open() {
    if (!state.owner || !adminScreen) return;
    adminScreen.hidden = false;
    window.KLABS_NAV?.goScreen("adminAccessScreen");
    return loadBuilders(true);
  }

  byId("settingsOpenAdminBtn")?.addEventListener("click", open);
  byId("adminBackToSettingsBtn")?.addEventListener("click", () => window.KLABS_NAV?.goScreen("settingsScreen"));
  byId("adminBuilderSearchForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    loadBuilders(true);
  });
  byId("adminBuilderStatusFilter")?.addEventListener("change", () => loadBuilders(true));
  byId("adminLoadMoreBtn")?.addEventListener("click", () => loadBuilders(false));

  byId("adminGrantComplimentaryBtn")?.addEventListener("click", (event) => {
    let expiresAt;
    try {
      expiresAt = endOfSelectedDay(byId("adminComplimentaryExpiry").value);
    } catch (error) {
      setStatus("adminChangeStatus", error?.message || "Choose a valid expiry date.");
      return;
    }
    const reason = byId("adminComplimentaryReason").value.trim();
    return performChange(event.currentTarget, "admin_set_complimentary_access", (builder) => ({
      p_target_user_id: builder.builder_user_id,
      p_expires_at: expiresAt,
      p_reason: reason
    }), `Grant or restore complimentary access for ${state.selected?.email}?`);
  });
  byId("adminRevokeComplimentaryBtn")?.addEventListener("click", (event) => {
    const reason = byId("adminRevokeReason").value.trim();
    return performChange(event.currentTarget, "admin_revoke_complimentary_access", (builder) => ({
      p_target_user_id: builder.builder_user_id,
      p_reason: reason
    }), `Revoke complimentary access for ${state.selected?.email}? Their records will remain available read-only.`);
  });
  byId("adminExtendTrialBtn")?.addEventListener("click", (event) => {
    let expiresAt;
    try {
      expiresAt = endOfSelectedDay(byId("adminTrialExpiry").value);
    } catch (error) {
      setStatus("adminChangeStatus", error?.message || "Choose a valid expiry date.");
      return;
    }
    const reason = byId("adminTrialReason").value.trim();
    return performChange(event.currentTarget, "admin_extend_builder_trial", (builder) => ({
      p_target_user_id: builder.builder_user_id,
      p_trial_expires_at: expiresAt,
      p_reason: reason
    }), `Extend the active trial for ${state.selected?.email}?`);
  });

  window.KLABS_ADMIN_ACCESS = {
    onAuthStateChanged,
    isOwner: () => state.owner,
    open
  };
})();
