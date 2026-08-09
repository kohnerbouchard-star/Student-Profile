import {
  AdminDataTable,
  AdminDialog,
  AdminEmptyState,
  AdminErrorState,
  AdminField,
  AdminIcon,
  AdminPageFrame,
  AdminStaleState,
} from "../../components/index.js";
import { createElement } from "../../components/dom.js";
import { ADMIN_DATA_STATES } from "../../core/data-state.js";
import { MarketplaceSkeleton } from "./MarketplaceSkeleton.js";

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
    value: "Administrator review",
    hint: "Required by the existing Marketplace moderation contract. Maximum 1,000 characters.",
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
    description: "This uses the current authoritative Marketplace lifecycle and optimistic version check.",
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
    AdminField({ name: "feeRate", label: "Fee rate", type: "number", value: String(policy.feeRate), required: true }),
    AdminField({ name: "taxRate", label: "Tax rate", type: "number", value: String(policy.taxRate), required: true }),
    AdminField({ name: "listingDurationHours", label: "Listing duration (hours)", type: "number", value: String(policy.listingDurationHours), required: true }),
    AdminField({ name: "purchaseReservationMinutes", label: "Purchase reservation (minutes)", type: "number", value: String(policy.purchaseReservationMinutes), required: true }),
    AdminField({ name: "disputeWindowDays", label: "Dispute window (days)", type: "number", value: String(policy.disputeWindowDays), required: true }),
    AdminField({ name: "blockedCountryCodes", label: "Blocked country codes", value: policy.blockedCountryCodes.join(", ") }),
  ];
  fields[0].control.step = fields[1].control.step = "0.000001";
  fields[0].control.min = fields[1].control.min = "0";
  fields[0].control.max = fields[1].control.max = "0.25";
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
    const data = new FormData(form);
    const nextPolicy = {
      marketplaceEnabled: data.get("marketplaceEnabled") === "on",
      crossCountryTradingEnabled: data.get("crossCountryTradingEnabled") === "on",
      moderationRequired: data.get("moderationRequired") === "on",
      feeRate: Number(data.get("feeRate")),
      taxRate: Number(data.get("taxRate")),
      listingDurationHours: Number(data.get("listingDurationHours")),
      purchaseReservationMinutes: Number(data.get("purchaseReservationMinutes")),
      disputeWindowDays: Number(data.get("disputeWindowDays")),
      disputesEnabled: data.get("disputesEnabled") === "on",
      countryFeeOverrides: policy.countryFeeOverrides,
      blockedCountryCodes: String(data.get("blockedCountryCodes") || "").split(",").map((code) => code.trim().toUpperCase()).filter(Boolean),
    };
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
    description: "Only fields supported by the existing authoritative Marketplace policy mutation are editable.",
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

function resolvedContent({ model, filters, onFiltersChange, onListing, onDispute, onPolicy }) {
  const search = AdminField({ name: "search", label: "Search listings", type: "search", value: filters.query, placeholder: "Item, seller, country, currency, or state" });
  const state = AdminField({
    name: "status", label: "Listing state", type: "select", value: filters.status,
    options: ["all", "active", "sold", "cancelled", "disputed", "moderation_hold", "draft", "expired", "rejected"].map((value) => ({ value, label: titleCase(value) })),
  });
  const listings = AdminDataTable({
    caption: "Marketplace listings",
    rowKey: (item) => item.rowKey,
    columns: [
      { key: "itemId", label: "Item", rowHeader: true },
      { key: "seller", label: "Seller", render: (_value, item) => item.seller.displayName },
      { key: "unitPrice", label: "Price", align: "end", render: (value, item) => amount(value, item.currencyCode) },
      { key: "quantityAvailable", label: "Available", align: "end" },
      { key: "effectiveStatus", label: "State", render: status },
      { key: "actions", label: "Actions", align: "end", render: (_value, item) => listingActions(item, { listing: onListing }) },
    ],
    emptyState: AdminEmptyState({ title: "No Marketplace listings", message: "No listings match the current search and state filter.", compact: true }),
  });
  function applyFilters() {
    const query = search.getValue().trim().toLowerCase();
    const selected = state.getValue();
    listings.setRows(model.listings.filter((item) => {
      const haystack = [item.itemId, item.seller.displayName, item.countryCode, item.currencyCode, item.status, item.effectiveStatus, item.moderationReason].join(" ").toLowerCase();
      return (!query || haystack.includes(query)) && (selected === "all" || item.effectiveStatus === selected);
    }));
    onFiltersChange({ query: search.getValue(), status: selected });
  }
  search.control.addEventListener("input", applyFilters);
  state.control.addEventListener("change", applyFilters);
  applyFilters();

  const disputes = AdminDataTable({
    caption: "Marketplace disputes",
    rowKey: (item) => item.rowKey,
    rows: model.disputes,
    columns: [
      { key: "openedBy", label: "Opened by", rowHeader: true, render: (_value, item) => item.openedBy.displayName },
      { key: "reason", label: "Reason" },
      { key: "status", label: "State", render: status },
      { key: "openedAt", label: "Opened", render: date },
      { key: "actions", label: "Actions", align: "end", render: (_value, item) => disputeActions(item, onDispute) },
    ],
    emptyState: AdminEmptyState({ title: "No Marketplace disputes", message: "Player disputes will appear here when opened.", compact: true }),
  });
  const orders = AdminDataTable({
    caption: "Marketplace settlement orders",
    rowKey: (item) => item.rowKey,
    rows: model.orders,
    columns: [
      { key: "itemId", label: "Item", rowHeader: true },
      { key: "buyer", label: "Buyer", render: (_value, item) => item.buyer.displayName },
      { key: "seller", label: "Seller", render: (_value, item) => item.seller.displayName },
      { key: "total", label: "Buyer total", align: "end", render: (value, item) => amount(value, item.currencyCode) },
      { key: "sellerProceeds", label: "Seller proceeds", align: "end", render: (value, item) => amount(value, item.currencyCode) },
      { key: "status", label: "State", render: status },
    ],
    emptyState: AdminEmptyState({ title: "No Marketplace settlement orders", message: "Completed Marketplace purchases will appear here.", compact: true }),
  });
  const policyButton = button("Edit policy", "settings", (event) => onPolicy(event.currentTarget), { action: "policy" });
  const policy = panel("Marketplace policy", "Authoritative Marketplace operating and moderation settings.", createElement("div", {
    className: "admin-marketplace-route__policy-grid",
    children: [
      ["Marketplace", model.policy.marketplaceEnabled ? "Enabled" : "Disabled"],
      ["Cross-country", model.policy.crossCountryTradingEnabled ? "Enabled" : "Disabled"],
      ["Moderation", model.policy.moderationRequired ? "Required" : "Not required"],
      ["Disputes", model.policy.disputesEnabled ? "Enabled" : "Disabled"],
      ["Fee rate", `${(model.policy.feeRate * 100).toLocaleString("en-US", { maximumFractionDigits: 4 })}%`],
      ["Tax rate", `${(model.policy.taxRate * 100).toLocaleString("en-US", { maximumFractionDigits: 4 })}%`],
      ["Listing duration", `${model.policy.listingDurationHours} hours`],
      ["Reservation", `${model.policy.purchaseReservationMinutes} minutes`],
      ["Dispute window", `${model.policy.disputeWindowDays} days`],
      ["Blocked countries", model.policy.blockedCountryCodes.join(", ") || "None"],
    ].map(([label, value]) => createElement("div", { children: [createElement("span", { text: label }), createElement("strong", { text: value })] })),
  }));
  policy.querySelector("header")?.append(policyButton);

  const audit = createElement("div", { className: "admin-marketplace-route__audit-list" });
  if (!model.audit.length) audit.append(AdminEmptyState({ title: "No Marketplace audit events", message: "Committed Marketplace lifecycle events will appear here.", compact: true }));
  else model.audit.slice(0, 12).forEach((event) => audit.append(createElement("article", {
    children: [
      createElement("strong", { text: titleCase(event.action) }),
      createElement("span", { text: event.disputeId || event.orderId || event.listingId || event.reservationId || "Marketplace" }),
      createElement("time", { text: `${titleCase(event.actorType)} · ${date(event.createdAt)}` }),
    ],
  })));

  return createElement("div", {
    className: "admin-marketplace-route__resolved",
    children: [
      createElement("section", { className: "admin-marketplace-route__summary", attrs: { "aria-label": "Marketplace moderation summary" }, children: [
        metric("Active listings", model.summary.activeListings, "Player-to-player listings"),
        metric("Sold listings", model.summary.soldListings, "Completed lifecycle"),
        metric("Open disputes", model.summary.openDisputes, "Require moderation review"),
        metric("Settled orders", model.summary.settledOrders, "Completed settlement"),
      ] }),
      domainNote(),
      createElement("section", { className: "admin-marketplace-route__filters", attrs: { "aria-label": "Marketplace listing filters" }, children: [search.element, state.element] }),
      model.isEmpty ? AdminEmptyState({ title: "No Marketplace activity yet", message: "No listings, reservations, orders, or disputes exist for this game. Marketplace policy remains available below." }) : null,
      panel("Listings", "Player-to-player listings and existing moderation actions.", listings.element),
      panel("Disputes", "Open and resolved Marketplace disputes.", disputes.element),
      panel("Settlement", `${model.reservations.length} reservations · ${model.postings.length} settlement postings`, orders.element),
      policy,
      panel("Lifecycle audit", "Recent authoritative Marketplace lifecycle events. Public Marketplace references only.", audit),
    ],
  });
}

export function MarketplaceRoute({
  state,
  filters = { query: "", status: "all" },
  onFiltersChange = () => {},
  onRefresh = async () => {},
  onModerateListing = async () => ({ ok: false }),
  onModerateDispute = async () => ({ ok: false }),
  onUpdatePolicy = async () => ({ ok: false }),
} = {}) {
  let destroyed = false;
  const dialogs = new Set();
  const dispose = (dialog) => { if (dialogs.delete(dialog)) dialog.destroy(); };
  const listing = (item, action, opener) => {
    const dialog = openModerationDialog({ kind: "listing", item, action, opener, onSubmit: (reason) => onModerateListing(item, action, reason), onDispose: dispose });
    dialogs.add(dialog);
  };
  const dispute = (item, action, opener) => {
    const dialog = openModerationDialog({ kind: "dispute", item, action, opener, onSubmit: (reason) => onModerateDispute(item, action, reason), onDispose: dispose });
    dialogs.add(dialog);
  };
  const policy = (opener) => {
    const dialog = openPolicyDialog({ model: state.data, opener, onSubmit: onUpdatePolicy, onDispose: dispose });
    dialogs.add(dialog);
  };
  const refresh = button(
    state.status === ADMIN_DATA_STATES.REFRESHING ? "Refreshing…" : "Refresh",
    "refresh",
    onRefresh,
    { action: "refresh", disabled: state.status === ADMIN_DATA_STATES.REFRESHING },
  );
  const route = createElement("div", {
    className: "admin-marketplace-route",
    dataset: { adminV2State: state.status },
    attrs: { "aria-busy": [ADMIN_DATA_STATES.INITIAL_LOADING, ADMIN_DATA_STATES.REFRESHING].includes(state.status) },
  });

  if (state.status === ADMIN_DATA_STATES.INITIAL_LOADING) route.append(MarketplaceSkeleton());
  else if (state.status === ADMIN_DATA_STATES.FAILED) route.append(AdminErrorState({
    title: "Marketplace Moderation could not be loaded",
    message: state.error?.userMessage,
    requestId: state.error?.requestId,
    retryAfterSeconds: state.error?.retryAfterSeconds,
    retry: state.error?.retryable ? { label: "Retry Marketplace", onClick: onRefresh } : null,
  }));
  else if (state.data) {
    const content = resolvedContent({ model: state.data, filters, onFiltersChange, onListing: listing, onDispute: dispute, onPolicy: policy });
    if (state.status === ADMIN_DATA_STATES.STALE) route.append(AdminStaleState({
      message: state.error?.userMessage || "Showing the last successful Marketplace snapshot while the service recovers.",
      retry: { label: "Retry", onClick: onRefresh },
      content,
    }));
    else {
      if (state.status === ADMIN_DATA_STATES.REFRESHING) route.append(createElement("div", {
        className: "admin-marketplace-route__refresh-state", attrs: { role: "status" },
        children: [AdminIcon({ name: "refresh", size: 16 }), "Refreshing authoritative Marketplace data…"],
      }));
      route.append(content);
    }
  }

  const frame = AdminPageFrame({
    eyebrow: "Game administration",
    title: "Marketplace Moderation",
    description: "Review player-to-player listings, settlement, disputes, supported moderation actions, and Marketplace policy for the current game.",
    actions: refresh,
    content: route,
  });
  return {
    ...frame,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      [...dialogs].forEach((dialog) => dialog.destroy());
      dialogs.clear();
    },
  };
}
