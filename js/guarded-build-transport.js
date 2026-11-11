// Revision-checked transport for the guard and the temporary pre-guard transition.
(function () {
  function failure(error, fallback) {
    const parts = [error?.message, error?.details, error?.hint, error?.code].filter(Boolean);
    return new Error(parts.join(" — ") || fallback);
  }

  function requireContext(context) {
    if (!context || !context.userId || typeof context.isCurrent !== "function" || !context.isCurrent()) {
      throw new Error("The signed-in account changed. The build was not synchronised.");
    }
  }

  async function save(client, context, record, revision, mode = "guarded") {
    requireContext(context);
    if (!record || !record.id) throw new Error("A stable build ID is required.");
    if (mode !== "guarded" && mode !== "compatibility") throw new Error("Invalid build sync mode.");
    const payload = { ...record };
    delete payload._expectedBuildRevision;
    delete payload._buildGuardCreate;
    const row = {
      user_id: context.userId,
      client_id: String(record.id),
      build_number: String(record.buildNumber || ""),
      payload,
    };
    let response;
    if (revision) {
      if (mode === "guarded") row.payload = { ...payload, _expectedBuildRevision: revision };
      else {
        const previous = Date.parse(revision);
        if (!Number.isFinite(previous)) throw new Error("The cloud build revision is invalid.");
        row.updated_at = new Date(Math.max(Date.now(), previous + 1)).toISOString();
      }
      response = await client.from("builds").update(row)
        .eq("user_id", context.userId).eq("client_id", row.client_id)
        .eq("updated_at", revision).select("*");
    } else {
      if (mode === "guarded") row.payload = { ...payload, _buildGuardCreate: 1 };
      response = await client.from("builds").insert(row).select("*");
    }
    if (response.error) throw failure(response.error, "Build synchronisation failed.");
    requireContext(context);
    if (!Array.isArray(response.data) || response.data.length !== 1) {
      throw new Error("The build changed on another device or was deleted. Review both versions before synchronising.");
    }
    return response.data[0];
  }

  async function remove(client, context, id, revision, mode = "guarded") {
    requireContext(context);
    if (!id || !revision) throw new Error("A stable build ID and verified revision are required.");
    if (mode !== "guarded" && mode !== "compatibility") throw new Error("Invalid build sync mode.");
    if (mode === "compatibility") {
      const { data, error } = await client.from("builds").delete()
        .eq("user_id", context.userId).eq("client_id", String(id)).eq("updated_at", revision).select("*");
      if (error) throw failure(error, "Build deletion could not be synchronised.");
      requireContext(context);
      if (!Array.isArray(data) || data.length !== 1) throw new Error("The build changed or was deleted on another device. Review before deleting.");
      return;
    }
    const { data, error } = await client.rpc("klabs_delete_build_if_revision", {
      p_client_id: String(id),
      p_revision: revision,
    });
    if (error) throw failure(error, "Build deletion could not be synchronised.");
    requireContext(context);
    if (data !== true) throw new Error("The build changed or was deleted on another device. Review before deleting.");
  }

  window.KLABS_GUARDED_BUILD_TRANSPORT = { save, remove };
})();
