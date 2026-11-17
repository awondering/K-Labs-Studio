(function () {
  const notice = document.getElementById("buildSyncNotice");
  const compatibility = document.getElementById("buildSyncCompatibility");
  const dialog = document.getElementById("buildSyncReview");
  const list = document.getElementById("buildSyncReviewList");
  const message = document.getElementById("buildSyncReviewMessage");
  const previous = window.KLABS_UI.onBuildSyncStatus;
  window.KLABS_UI.onBuildSyncStatus = (status) => {
    previous?.(status);
    notice.hidden = status !== "error";
  };
  window.KLABS_UI.onBuildSyncMode = (mode) => {
    compatibility.hidden = mode !== "compatibility";
  };
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  function render() {
    list.replaceChildren();
    const sync = window.KLABS_BUILD_SYNC;
    const conflicts = sync.getConflicts();
    const context = sync.getConflictContext?.() || {};
    const items = Object.values(conflicts);
    message.textContent = items.length ? "" : "Nothing needs review. Everything is up to date.";
    items.forEach((conflict) => {
      const info = window.KLABS_BUILD_SYNC_DIFF.describe(conflict, context[conflict.id]);
      const section = el("section", "build-sync-review__item");
      section.append(el("h3", "", info.title));
      section.append(el("p", "build-sync-review__summary", info.summary));
      const flags = [];
      if (info.customerDiffers) flags.push("Customer details differ");
      if (info.financialDiffers) flags.push("Payment, price or invoice details differ");
      if (flags.length) section.append(el("p", "build-sync-review__flags", flags.join(" · ")));
      if (info.unsaved) section.append(el("p", "build-sync-review__flags", "This build has typing that is not saved yet. Wait a moment, then review again."));
      if (info.rows.length) {
        const table = el("table", "build-sync-review__table");
        const head = el("tr");
        ["Field", "This device", "Cloud", "Changed on"].forEach((t) => head.append(el("th", "", t)));
        table.append(head);
        info.rows.forEach((row) => {
          const tr = el("tr", row.kind === "stamp" ? "is-stamp" : row.kind === "financial" ? "is-financial" : "");
          tr.append(el("td", "", row.label), el("td", "", row.mine), el("td", "", row.cloud),
            el("td", "", row.changedBy === "unknown" ? "" : row.changedBy === "neither" ? "—" : row.changedBy === "cloud" ? "cloud" : row.changedBy));
          table.append(tr);
        });
        section.append(table);
      }
      const choices = el("div", "build-sync-review__choices");
      info.options.forEach((option) => {
        const box = el("div", "build-sync-review__choice");
        const button = el("button", "ghost-action", option.label);
        button.type = "button";
        const writable = typeof window.KLABS_CAN_WRITE !== "function" || window.KLABS_CAN_WRITE();
        button.disabled = !writable || option.disabled || info.unsaved;
        box.append(button, el("p", "build-sync-review__effect", option.disabled ? option.why : option.effect));
        button.addEventListener("click", async () => {
          if (!window.confirm(`${option.label}? ${option.effect}`)) return;
          button.disabled = true;
          try {
            await sync.resolveConflict(conflict.id, option.choice, conflict.revision);
            render();
          } catch (error) {
            console.error("[K-Labs Studio] Could not resolve build conflict:", error);
            render();
            message.textContent = error.message || "Could not resolve this conflict.";
          }
        });
        choices.append(box);
      });
      section.append(choices);
      const copy = el("button", "ghost-action build-sync-review__copy", "Copy diagnostics (no customer text)");
      copy.type = "button";
      copy.addEventListener("click", async () => {
        const report = window.KLABS_BUILD_SYNC_DIFF.redactedReport(conflict, context[conflict.id]);
        try { await navigator.clipboard.writeText(report); message.textContent = "Diagnostics copied. They contain no customer text."; }
        catch (error) { message.textContent = "Could not copy. Select and copy the text shown below."; section.append(el("pre", "", report)); }
      });
      section.append(copy);
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
