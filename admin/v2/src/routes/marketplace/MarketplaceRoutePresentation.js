import { AdminConfirmDialog, AdminDialog, AdminField, AdminIcon } from "../../components/index.js";
import { createElement } from "../../components/dom.js";




function titleCase(value) {
  const text = String(value || "unknown").trim();
  return text.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function amount(value, currency) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  const text = number.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return currency ? `${text} ${currency}` : text;
}

function date(value) {
  const ms = Date.parse(String(value || ""));
  if (!Number.isFinite(ms)) return "—";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(ms));
}

function status(value) {
  return createElement("span", {
    className: "admin-marketplace-route__status",
    dataset: { status: String(value || "unknown").toLowerCase() },
    text: titleCase(value),
  });
}

function button(label, icon, onClick, { action = "", danger = false, disabled = false } = {}) {
  const element = createElement("button", {
    className: "admin-button admin-button--quiet",
    attrs: { type: "button", disabled },
    dataset: { marketplaceAction: action, tone: danger ? "danger" : "" },
    children: [AdminIcon({ name: icon, size: 15 }), label],
  });
  element.addEventListener("click", onClick);
  return element;
}

function metric(label, value, detail) {
  return createElement("article", {
    className: "admin-marketplace-route__metric",
    children: [
      createElement("span", { text: label }),
      createElement("strong", { text: Number(value || 0).toLocaleString("en-US") }),
      createElement("small", { text: detail }),
    ],
  });
}

function domainNote() {
  return createElement("aside", {
    className: "admin-marketplace-route__domain-note",
    attrs: { role: "note" },
    children: [
      AdminIcon({ name: "marketplace", size: 18 }),
      createElement("div", { children: [
        createElement("strong", { text: "Marketplace is player-to-player trade." }),
        createElement("p", {
          text: "Financial Market instruments, securities, price charts, trading sessions, and stock order tickets are not part of this route. Offers are not shown because the current authoritative Marketplace Admin contract does not expose an offers collection or offer mutation.",
        }),
      ] }),
    ],
  });
}

function panel(title, description, content) {
  return createElement("section", {
    className: "admin-marketplace-route__panel",
    children: [
      createElement("header", { children: [
        createElement("div", { children: [
          createElement("h2", { text: title }),
          description ? createElement("p", { className: "admin-u-muted", text: description }) : null,
        ] }),
      ] }),
      content,
    ],
  });
}

function openModerationDialog({ kind, item, action, opener, onSubmit, onDispose }) {
  const reason = AdminField({
    name: "reason",
    label: "Administrator reason",
    type: "textarea",
    required: true,
    value: "",
    hint: "Required. Record the specific reason for this moderation decision. Maximum 1,000 characters.",
  });
  reason.control.maxLength = 1_000;
  reason.control.rows = 5;
  const feedback = createElement("p", { className: "admin-marketplace-route__feedback", attrs: { role: "alert" } });
  feedback.hidden = true;
  const cancel = button("Cancel", "close", () => dialog.close("cancelled"));
  const confirm = createElement("button", {
    className: "admin-button",
    attrs: { type: "submit" },
    dataset: { marketplaceAction: action, tone: ["reject", "refund"].includes(action) ? "danger" : "" },
    text: action === "resolve-seller" ? "Resolve for seller" : titleCase(action),
  });
  const form = createElement("form", {
    className: "admin-marketplace-route__dialog-form",
    children: [
      createElement("p", {
        className: "admin-u-muted",
        text: kind === "listing"
          ? `${item.itemId} · ${item.seller.displayName} · ${titleCase(item.status)}`
          : `${item.id} · opened by ${item.openedBy.displayName} · ${titleCase(item.status)}`,
      }),
      reason.element,
      feedback,
      createElement("div", { className: "admin-marketplace-route__dialog-actions", children: [cancel, confirm] }),
    ],
  });
  let dialog;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const value = reason.getValue().trim();
    reason.setError(value ? "" : "Enter a reason for this moderation action.");
    if (!value) return;
    feedback.hidden = true;
    dialog.setBusy(true);
    const result = await onSubmit(value);
    if (result?.ok) dialog.close("committed");
    else {
      dialog.setBusy(false);
      feedback.textContent = result?.error?.userMessage || "The Marketplace action could not be completed.";
      feedback.hidden = false;
    }
  });
  dialog = AdminDialog({
    title: kind === "listing" ? `${titleCase(action)} listing` : `${titleCase(action)} dispute`,
    description: "The decision is recorded in the Marketplace moderation history for this game.",
    content: form,
    initialFocus: reason.control,
    onClose() { queueMicrotask(() => onDispose(dialog)); },
  });
  dialog.open(opener);
  return dialog;
}

function openPolicyDialog({ model, opener, onSubmit, onDispose }) {
  const policy = model.policy;
  const fields = [
    AdminField({ name: "feeRate", label: "Fee rate (%)", type: "number", value: String(policy.feeRate * 100), required: true, min: 0, max: 25, step: 0.01 }),
    AdminField({ name: "taxRate", label: "Tax rate (%)", type: "number", value: String(policy.taxRate * 100), required: true, min: 0, max: 25, step: 0.01 }),
    AdminField({ name: "listingDurationHours", label: "Listing duration (hours)", type: "number", value: String(policy.listingDurationHours), required: true }),
    AdminField({ name: "purchaseReservationMinutes", label: "Purchase reservation (minutes)", type: "number", value: String(policy.purchaseReservationMinutes), required: true }),
    AdminField({ name: "disputeWindowDays", label: "Dispute window (days)", type: "number", value: String(policy.disputeWindowDays), required: true }),
    AdminField({ name: "blockedCountryCodes", label: "Blocked country codes", value: policy.blockedCountryCodes.join(", "), hint: "Comma-separated country codes. Codes are normalized to uppercase." }),
  ];
  fields[2].control.min = "1"; fields[2].control.max = "720";
  fields[3].control.min = "1"; fields[3].control.max = "60";
  fields[4].control.min = "1"; fields[4].control.max = "30";

  function toggle(name, label, checked) {
    const input = createElement("input", { attrs: { type: "checkbox", name } });
    input.checked = checked;
    return createElement("label", { className: "admin-marketplace-route__toggle", children: [input, createElement("span", { text: label })] });
  }
  const toggles = [
    toggle("marketplaceEnabled", "Marketplace enabled", policy.marketplaceEnabled),
    toggle("crossCountryTradingEnabled", "Cross-country trading", policy.crossCountryTradingEnabled),
    toggle("moderationRequired", "Moderation required", policy.moderationRequired),
    toggle("disputesEnabled", "Disputes enabled", policy.disputesEnabled),
  ];
  const feedback = createElement("p", { className: "admin-marketplace-route__feedback", attrs: { role: "alert" } });
  feedback.hidden = true;
  const cancel = button("Cancel", "close", () => dialog.close("cancelled"));
  const save = createElement("button", { className: "admin-button", attrs: { type: "submit" }, text: "Save policy" });
  const form = createElement("form", {
    className: "admin-marketplace-route__dialog-form",
    children: [
      createElement("div", { className: "admin-marketplace-route__toggle-grid", children: toggles }),
      createElement("div", { className: "admin-marketplace-route__policy-form-grid", children: fields.map((field) => field.element) }),
      feedback,
      createElement("div", { className: "admin-marketplace-route__dialog-actions", children: [cancel, save] }),
    ],
  });
  let dialog;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    feedback.hidden = true;
    fields.forEach((field) => field.setError(""));
    const data = new FormData(form);
    const feePercent = Number(data.get("feeRate"));
    const taxPercent = Number(data.get("taxRate"));
    const duration = Number(data.get("listingDurationHours"));
    const reservation = Number(data.get("purchaseReservationMinutes"));
    const disputeDays = Number(data.get("disputeWindowDays"));
    const blockedCodes = String(data.get("blockedCountryCodes") || "")
      .split(",")
      .map((code) => code.trim().toUpperCase())
      .filter(Boolean);
    let invalid = false;
    if (!Number.isFinite(feePercent) || feePercent < 0 || feePercent > 25) {
      fields[0].setError("Use a fee rate from 0% through 25%."); invalid = true;
    }
    if (!Number.isFinite(taxPercent) || taxPercent < 0 || taxPercent > 25) {
      fields[1].setError("Use a tax rate from 0% through 25%."); invalid = true;
    }
    if (!Number.isInteger(duration) || duration < 1 || duration > 720) {
      fields[2].setError("Use 1 through 720 hours."); invalid = true;
    }
    if (!Number.isInteger(reservation) || reservation < 1 || reservation > 60) {
      fields[3].setError("Use 1 through 60 minutes."); invalid = true;
    }
    if (!Number.isInteger(disputeDays) || disputeDays < 1 || disputeDays > 30) {
      fields[4].setError("Use 1 through 30 days."); invalid = true;
    }
    if (blockedCodes.some((code) => !/^[A-Z0-9_-]{2,24}$/.test(code))) {
      fields[5].setError("Use valid country codes separated by commas."); invalid = true;
    }
    if (invalid) {
      form.querySelector("[aria-invalid='true']")?.focus();
      return;
    }
    const nextPolicy = {
      marketplaceEnabled: data.get("marketplaceEnabled") === "on",
      crossCountryTradingEnabled: data.get("crossCountryTradingEnabled") === "on",
      moderationRequired: data.get("moderationRequired") === "on",
      feeRate: feePercent / 100,
      taxRate: taxPercent / 100,
      listingDurationHours: duration,
      purchaseReservationMinutes: reservation,
      disputeWindowDays: disputeDays,
      disputesEnabled: data.get("disputesEnabled") === "on",
      countryFeeOverrides: policy.countryFeeOverrides,
      blockedCountryCodes: blockedCodes,
    };
    const changed = [
      ["Marketplace", policy.marketplaceEnabled, nextPolicy.marketplaceEnabled],
      ["Cross-country trading", policy.crossCountryTradingEnabled, nextPolicy.crossCountryTradingEnabled],
      ["Moderation required", policy.moderationRequired, nextPolicy.moderationRequired],
      ["Disputes", policy.disputesEnabled, nextPolicy.disputesEnabled],
      ["Fee rate", `${(policy.feeRate * 100).toFixed(2)}%`, `${(nextPolicy.feeRate * 100).toFixed(2)}%`],
      ["Tax rate", `${(policy.taxRate * 100).toFixed(2)}%`, `${(nextPolicy.taxRate * 100).toFixed(2)}%`],
      ["Listing duration", `${policy.listingDurationHours} h`, `${nextPolicy.listingDurationHours} h`],
      ["Reservation", `${policy.purchaseReservationMinutes} min`, `${nextPolicy.purchaseReservationMinutes} min`],
      ["Dispute window", `${policy.disputeWindowDays} d`, `${nextPolicy.disputeWindowDays} d`],
      ["Blocked countries", policy.blockedCountryCodes.join(", ") || "None", nextPolicy.blockedCountryCodes.join(", ") || "None"],
    ].filter(([, before, after]) => String(before) !== String(after));
    if (!changed.length) {
      feedback.textContent = "No policy changes to save.";
      feedback.hidden = false;
      return;
    }
    const review = AdminConfirmDialog({
      title: "Review Marketplace policy changes",
      message: "Apply these Marketplace operating changes?",
      detail: "Disabling Marketplace features can immediately change what players can do.",
      changes: changed.map(([label, before, after]) => ({ label, before: String(before), after: String(after) })),
      confirmLabel: "Apply policy changes",
      tone: changed.some(([label, before, after]) => /Marketplace|Cross-country|Disputes/.test(label) && before === true && after === false)
        ? "danger"
        : "neutral",
      onConfirm: () => true,
    });
    const accepted = await review.open(save);
    review.destroy();
    if (!accepted) return;
    dialog.setBusy(true);
    const result = await onSubmit(nextPolicy);
    if (result?.ok) dialog.close("committed");
    else {
      dialog.setBusy(false);
      feedback.textContent = result?.error?.userMessage || "The Marketplace policy could not be saved.";
      feedback.hidden = false;
    }
  });
  dialog = AdminDialog({
    title: "Marketplace policy",
    description: "Edit the supported Marketplace operating rules. Rates are entered as percentages and converted internally.",
    content: form,
    size: "large",
    initialFocus: fields[0].control,
    onClose() { queueMicrotask(() => onDispose(dialog)); },
  });
  dialog.open(opener);
  return dialog;
}

function listingActions(item, callbacks) {
  const actions = createElement("div", { className: "admin-marketplace-route__row-actions" });
  if (["draft", "active"].includes(item.status)) actions.append(button("Hold", "warning", (event) => callbacks.listing(item, "hold", event.currentTarget), { action: "hold" }));
  if (["draft", "moderation_hold"].includes(item.status)) actions.append(button("Approve", "success", (event) => callbacks.listing(item, "approve", event.currentTarget), { action: "approve" }));
  if (["draft", "active", "moderation_hold"].includes(item.status)) actions.append(button("Reject", "close", (event) => callbacks.listing(item, "reject", event.currentTarget), { action: "reject", danger: true }));
  return actions;
}

function disputeActions(item, callback) {
  const actions = createElement("div", { className: "admin-marketplace-route__row-actions" });
  if (item.status !== "open") return createElement("span", { className: "admin-u-muted", text: "Closed" });
  actions.append(
    button("Refund buyer", "refresh", (event) => callback(item, "refund", event.currentTarget), { action: "refund", danger: true }),
    button("Resolve seller", "success", (event) => callback(item, "resolve-seller", event.currentTarget), { action: "resolve-seller" }),
    button("Reject", "close", (event) => callback(item, "reject", event.currentTarget), { action: "reject", danger: true }),
  );
  return actions;
}

export {
  titleCase,
  amount,
  date,
  status,
  button,
  metric,
  domainNote,
  panel,
  openModerationDialog,
  openPolicyDialog,
  listingActions,
  disputeActions,
};
