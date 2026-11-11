(function () {
  const notice = document.getElementById("buildSyncNotice");
  const dialog = document.getElementById("buildSyncReview");
  const list = document.getElementById("buildSyncReviewList");
  const message = document.getElementById("buildSyncReviewMessage");
  const previous = window.KLABS_UI.onBuildSyncStatus;
  window.KLABS_UI.onBuildSyncStatus = (status) => {
    previous?.(status);
    notice.hidden = status !== "error";
  };
  function render() {
    list.replaceChildren();
    const conflicts = window.KLABS_BUILD_SYNC.getConflicts();
    const items = Object.values(conflicts);
    message.textContent = items.length ? "" : "No conflicts are available. Retry the connection to check for changes.";
    items.forEach((conflict) => {
      const section = document.createElement("section");
      const heading = document.createElement("h3");
      heading.textContent = `Build ID: ${conflict.id}`;
      section.append(heading);
      const reason = document.createElement("p");
      reason.textContent = conflict.reason;
      section.append(reason);
      const versions = document.createElement("div");
      versions.className = "build-sync-review__versions";
      ["local", "cloud"].forEach((side) => {
        const container = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = side === "local" ? "Local version" : "Cloud version";
        const details = document.createElement("pre");
        details.textContent = conflict[side] ? JSON.stringify(conflict[side], null, 2) : "No version";
        container.append(title, details);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "ghost-action";
        button.textContent = side === "local" && conflict.operation === "delete" ? "Confirm deletion" :
          side === "local" ? "Keep local version" : "Keep cloud version";
        button.disabled = typeof window.KLABS_CAN_WRITE === "function" && !window.KLABS_CAN_WRITE();
        button.addEventListener("click", async () => {
          const action = side === "local" && conflict.operation === "delete" ? "Delete" : `Keep the ${side} version of`;
          if (!window.confirm(`${action} build ${conflict.id}? Both versions will be archived on this device.`)) return;
          button.disabled = true;
          try {
            await window.KLABS_BUILD_SYNC.resolveConflict(conflict.id, side, conflict.revision);
            render();
          } catch (error) {
            console.error("[K-Labs Studio] Could not resolve build conflict:", error);
            render();
            message.textContent = error.message || "Could not resolve this conflict.";
          }
        });
        container.append(button);
        versions.append(container);
      });
      section.append(versions);
      list.append(section);
    });
  }
  document.getElementById("buildSyncReviewButton").addEventListener("click", () => { render(); dialog.showModal(); });
  document.getElementById("buildSyncClose").addEventListener("click", () => dialog.close());
  document.getElementById("buildSyncRetry").addEventListener("click", async () => {
    await window.KLABS_BUILD_SYNC.retry();
    render();
  });
})();
