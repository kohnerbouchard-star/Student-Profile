import {
  titleCase, amount, date, status, button, metric, domainNote, panel, openModerationDialog,
  openPolicyDialog, listingActions, disputeActions,
} from "./MarketplaceRoutePresentation.js";
import {
  AdminDataTable, AdminEmptyState, AdminErrorState, AdminField, AdminIcon, AdminPageFrame,
  AdminStaleState,
} from "../../components/index.js";
import { createElement } from "../../components/dom.js";
import { ADMIN_DATA_STATES } from "../../core/data-state.js";
import { MarketplaceSkeleton } from "./MarketplaceSkeleton.js";

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
