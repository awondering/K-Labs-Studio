// Pure helpers that turn a synchronisation conflict into something a builder can read, and into a redacted report.
// No DOM access and no storage access: everything is derived from the records passed in.
(function () {
  const LABELS = {
    customerName: "Customer name", company: "Company", phone: "Phone", email: "Email", addressLine1: "Address line 1",
    addressLine2: "Address line 2", suburbLocality: "Suburb", cityTown: "City / town", regionState: "Region", postcode: "Postcode",
    country: "Country", buildName: "Build name", buildNumber: "Build number", quoteNumber: "Quote number", quoteStatus: "Status",
    status: "Status", notes: "Notes", estimatedCompletionDate: "Estimated completion", completedAt: "Completed", createdAt: "Created",
    finalCustomerPrice: "Customer price", targetProfit: "Required profit", labourHours: "Labour hours", labourRate: "Labour rate",
    payments: "Payments", issuedInvoice: "Issued invoice", components: "Components", depositEnabled: "Deposit required",
    depositType: "Deposit type", depositValue: "Deposit amount", taxRate: "Tax rate", includeTax: "Include tax",
    blankName: "Blank", blankMaker: "Blank maker", buildSpecifications: "Build specifications", guideSpecification: "Guide specification",
  };
  const CUSTOMER = new Set(["customerName", "company", "phone", "email", "addressLine1", "addressLine2", "suburbLocality", "cityTown",
    "regionState", "postcode", "country"]);
  const FINANCIAL = /^(payments|issuedInvoice|finalCustomerPrice|deposit|tax|gst|price|total|balance|freight|packaging|labour|targetProfit|markup|margin)/i;
  const HARD_FINANCIAL = new Set(["payments", "issuedInvoice"]);
  const STAMPS = new Set(["savedAt", "updatedAt"]);
  const canon = (v) => Array.isArray(v) ? v.map(canon) : v && typeof v === "object"
    ? Object.keys(v).sort().reduce((o, k) => (o[k] = canon(v[k]), o), {}) : v;
  const eq = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
  const label = (key) => LABELS[key] || key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
  const money = (n) => `$${Number(n).toFixed(2)}`;
  function kindOf(key) {
    if (STAMPS.has(key)) return "stamp";
    if (CUSTOMER.has(key)) return "customer";
    if (FINANCIAL.test(key)) return "financial";
    return "other";
  }
  function show(key, value) {
    if (value === undefined || value === null || value === "") return "—";
    if (key === "payments" && Array.isArray(value)) {
      return value.length ? value.map((p) => `${p?.type === "balance" ? "Balance" : "Deposit"} ${money(p?.amount || 0)} on ${p?.date || "unknown date"}`).join("; ") : "None";
    }
    if (key === "issuedInvoice" && value && typeof value === "object") return `Invoice ${value.number || value.invoiceNumber || ""} ${value.total !== undefined ? money(value.total) : ""}`.trim();
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "number") return /price|profit|cost|amount|total|rate|freight|packaging/i.test(key) ? money(value) : String(value);
    if (typeof value === "string") return value.length > 90 ? `${value.slice(0, 87)}…` : value;
    if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? "" : "s"}`;
    return "details differ";
  }
  const without = (record) => { const copy = { ...(record || {}) }; delete copy._expectedBuildRevision; delete copy._buildGuardCreate; return copy; };
  function rows(mine, cloud, baseline) {
    const m = without(mine), c = without(cloud), b = baseline ? without(baseline) : null;
    const out = [];
    for (const key of [...new Set([...Object.keys(m), ...Object.keys(c)])].sort()) {
      if (key === "id" || eq(m[key], c[key])) continue;
      let changedBy = "unknown";
      if (b) {
        const mineChanged = !eq(m[key], b[key]);
        const cloudChanged = !eq(c[key], b[key]);
        changedBy = mineChanged && cloudChanged ? "both" : mineChanged ? "this device" : cloudChanged ? "cloud" : "neither";
      }
      out.push({ key, label: label(key), kind: kindOf(key), mine: show(key, m[key]), cloud: show(key, c[key]), changedBy });
    }
    return out.sort((x, y) => (x.kind === "stamp") - (y.kind === "stamp") || x.label.localeCompare(y.label));
  }
  function describe(conflict, context) {
    const info = context || {};
    const mine = conflict.local, cloud = conflict.cloud;
    const diff = mine && cloud ? rows(mine, cloud, info.baseline) : [];
    const real = diff.filter((r) => r.kind !== "stamp");
    const record = mine || cloud || {};
    const name = [record.customerName, record.buildName].filter(Boolean).join(" — ");
    const hardFinancial = diff.some((r) => HARD_FINANCIAL.has(r.key));
    const options = [];
    options.push({ choice: "cloud", label: "Use the cloud version",
      effect: "This device's copy is replaced by the cloud version. This device's version is archived on this device first.", disabled: false });
    const local = { choice: "local", label: "Keep this device's version",
      effect: "Uploads this device's copy and replaces the cloud version. The cloud version is archived on this device first.", disabled: false, why: "" };
    if (conflict.operation === "delete") { local.label = "Confirm deletion"; local.effect = "Deletes the build from the cloud. Both versions are archived on this device first."; }
    else if (!cloud) { local.label = "Keep this device's version"; local.effect = "Restores this build to the cloud from this device's copy."; }
    else if (info.localUnedited) { local.disabled = true; local.why = "This device has no changes of its own, so there is nothing of yours to keep."; }
    else if (hardFinancial) { local.disabled = true; local.why = "Payments or the issued invoice differ. These can only be changed by recording a payment or invoice, so use the cloud version and re-enter any change you still need."; }
    options.push(local);
    let summary;
    if (!cloud) summary = "This build no longer exists in the cloud.";
    else if (!mine) summary = "This build is no longer on this device.";
    else if (!real.length) summary = "The two versions hold the same information. Only the saved-at times differ.";
    else if (info.localUnedited) summary = "Nothing was changed on this device. The cloud version has newer changes.";
    else summary = `${real.length} field${real.length === 1 ? "" : "s"} differ.`;
    return { id: conflict.id, title: name || `Build ${conflict.buildNumber || conflict.id}`, reason: conflict.reason, summary,
      customerDiffers: real.some((r) => r.kind === "customer"), financialDiffers: real.some((r) => r.kind === "financial"),
      stampsOnly: !!(mine && cloud) && !real.length, rows: diff, options, unsaved: !!info.unsaved, revision: conflict.revision };
  }
  // Redacted: numbers, booleans, timestamps and status words are shown; any other text becomes length plus a fingerprint that is
  // only comparable inside one report (random salt). Safe to share.
  function redactedReport(conflict, context) {
    const salt = String(Math.random()).slice(2, 10);
    const fp = (t) => { let h = 2166136261; for (const ch of salt + t) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0).toString(16).padStart(8, "0"); };
    const SAFE = /^(quoteStatus|status|type|kind|currency|recordType|date|dueDate|estimatedCompletionDate|depositType|pricingDriver)$/;
    const ISO = /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/;
    const cell = (key, v) => v === undefined ? "<absent>" : v === null || typeof v === "number" || typeof v === "boolean" ? v
      : typeof v === "string" ? (ISO.test(v) || SAFE.test(key) ? v : `<text len=${v.length} #${fp(v)}>`)
      : Array.isArray(v) ? `<list of ${v.length}>` : "<object>";
    const info = context || {};
    const d = rows(conflict.local, conflict.cloud, info.baseline);
    return JSON.stringify({ note: "Redacted synchronisation report. Contains no customer text.", buildId: conflict.id, reason: conflict.reason,
      operation: conflict.operation, createdAt: conflict.createdAt || null, revision: conflict.revision || null,
      localUnedited: !!info.localUnedited, pending: info.pendingKind || null, fields: d.map((r) => ({ field: r.key, kind: r.kind,
        changedBy: r.changedBy, thisDevice: cell(r.key, (conflict.local || {})[r.key]), cloud: cell(r.key, (conflict.cloud || {})[r.key]) })) }, null, 2);
  }
  window.KLABS_BUILD_SYNC_DIFF = { describe, redactedReport, rows };
})();
