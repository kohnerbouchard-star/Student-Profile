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
import { InventorySkeleton } from "./InventorySkeleton.js";

const STATUS_OPTIONS = Object.freeze([
  { value: "pending", label: "Pending review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "fulfilled", label: "Fulfilled" },
  { value: "all", label: "All history" },
]);

function titleCase(value, fallback = "Not available") {
  const text = String(value || "").trim();
  return text
    ? text.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
    : fallback;
}

function displayDate(value) {
  const timestamp = Date.parse(String(value || ""));
  if (!Number.isFinite(timestamp)) return "Not available";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function metric(label, value, detail) {
  return createElement("article", {
    className: "admin-inventory-route__metric",
    children: [
      createElement("span", { text: label }),
      createElement("output", { text: Number(value || 0).toLocaleString("en-US") }),
      createElement("small", { text: detail }),
    ],
  });
}

function summary(model) {
  return createElement("section", {
    className: "admin-inventory-route__summary",
    attrs: { "aria-label": "Inventory redemption summary for this page" },
    children: [
      metric("Pending", model.summary.pending, "This page only"),
      metric("Approved", model.summary.approved, "This page only"),
      metric("Closed", model.summary.rejected + model.summary.fulfilled, "This page only"),
    ],
  });
}

function contractNotice(model) {
  const metadata = [];
  if (model.contract.exposesProvenance) metadata.push("provenance");
  if (model.contract.exposesType) metadata.push("type");
  return createElement("aside", {
    className: "admin-inventory-route__contract-note",
    attrs: { role: "note", "aria-label": "Canonical inventory contract boundary" },
    children: [
      createElement("strong", { text: "Redemption review · current page" }),
      createElement("p", {
        text: "Search and summary counts apply only to the currently loaded server page. Requested quantities are redemption requests, not a second owned-item balance ledger.",
      }),
      createElement("p", {
        text: model.contract.exposesBusinessRelationship
          ? "Owner relationships are shown only when the authoritative response supplies them."
          : "The current Admin response exposes the player relationship, but not arbitrary owned balances or business ownership links.",
      }),
      metadata.length
        ? createElement("small", { text: `Additional item metadata exposed here: ${metadata.join(", ")}.` })
        : createElement("small", { text: "Seeded/custom provenance is not inferred when the response does not provide it." }),
    ],
  });
}

function statusBadge(status) {
  return createElement("span", {
    className: "admin-inventory-route__status",
    dataset: { status: status || "unknown" },
    text: titleCase(status),
  });
}

function playerCell(row) {
  const detail = [row.player.reference, row.player.rosterLabel].filter(Boolean).join(" · ");
  return createElement("div", {
    className: "admin-inventory-route__identity",
    children: [
      createElement("strong", { text: row.player.displayName }),
      createElement("small", { text: detail || "Player relationship" }),
    ],
  });
}

function itemCell(row) {
  const metadata = [row.item.category, row.item.provenance, row.item.type]
    .filter(Boolean)
    .map(titleCase)
    .join(" · ");
  return createElement("div", {
    className: "admin-inventory-route__item",
    children: [
      createElement("strong", { text: row.item.name }),
      createElement("small", { text: metadata || "Item metadata unavailable" }),
    ],
  });
}

function reviewActions(row, onOpenReview) {
  const root = createElement("div", { className: "admin-inventory-route__row-actions" });
  const specs = row.status === "pending"
    ? [
        { action: "approve", label: "Approve" },
        { action: "reject", label: "Reject", tone: "danger" },
      ]
    : row.status === "approved"
      ? [{ action: "fulfill", label: "Fulfill" }]
      : [];

  if (specs.length === 0) {
    root.append(createElement("span", {
      className: "admin-inventory-route__action-note",
      text: "No further action",
    }));
    return root;
  }

  specs.forEach((spec) => {
    const button = createElement("button", {
      className: "admin-button admin-button--quiet",
      attrs: { type: "button" },
      dataset: { inventoryAction: spec.action, tone: spec.tone || "neutral" },
      text: spec.label,
    });
    button.addEventListener("click", (event) => onOpenReview(row, spec.action, event.currentTarget));
    root.append(button);
  });
  return root;
}

function reviewDialog({ row, action, opener, onReview, onReviewCommitted }) {
  const note = AdminField({
    name: "note",
    label: action === "reject" ? "Rejection reason" : "Administrative note",
    type: "textarea",
    required: action === "reject",
    hint: action === "reject"
      ? "Required. Explain why this redemption cannot proceed."
      : "Optional note for the authoritative redemption audit trail.",
  });
  note.control.maxLength = 1000;
  note.control.rows = 5;

  const status = createElement("p", {
    className: "admin-inventory-route__review-status",
    attrs: { role: "status", "aria-live": "polite" },
    text: `Confirm ${action} for this redemption.`,
  });
  const cancel = createElement("button", {
    className: "admin-button admin-button--quiet",
    attrs: { type: "button" },
    dataset: { dialogAction: "cancel" },
    text: "Cancel",
  });
  const submit = createElement("button", {
    className: "admin-button",
    attrs: { type: "submit" },
    dataset: { dialogAction: "submit", tone: action === "reject" ? "danger" : "neutral" },
    text: `${titleCase(action)} redemption`,
  });
  const form = createElement("form", {
    className: "admin-inventory-route__review-form",
    children: [
      createElement("dl", {
        className: "admin-inventory-route__review-summary",
        children: [
          createElement("div", { children: [createElement("dt", { text: "Player" }), createElement("dd", { text: row.player.displayName })] }),
          createElement("div", { children: [createElement("dt", { text: "Item" }), createElement("dd", { text: row.item.name })] }),
          createElement("div", { children: [createElement("dt", { text: "Requested quantity" }), createElement("dd", { text: row.quantity })] }),
          createElement("div", { children: [createElement("dt", { text: "Current state" }), createElement("dd", { text: titleCase(row.status) })] }),
        ],
      }),
      row.requestNote
        ? createElement("div", {
            className: "admin-inventory-route__request-note",
            children: [createElement("strong", { text: "Player note" }), createElement("p", { text: row.requestNote })],
          })
        : null,
      note.element,
      status,
      createElement("div", {
        className: "admin-inventory-route__review-actions",
        children: [cancel, submit],
      }),
    ],
  });

  let dialog = null;
  dialog = AdminDialog({
    title: `${titleCase(action)} inventory redemption`,
    description: "This action uses the existing canonical inventory redemption workflow.",
    content: form,
    size: "medium",
    closeOnBackdrop: false,
    initialFocus: () => note.control,
    onClose() {
      queueMicrotask(() => dialog?.destroy());
    },
  });

  cancel.addEventListener("click", () => dialog.close("cancelled"));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const reviewNote = note.getValue().trim();
    note.setError("");
    if (action === "reject" && !reviewNote) {
      note.setError("A rejection reason is required.");
      note.focus();
      return;
    }

    dialog.setBusy(true);
    note.setDisabled(true);
    status.dataset.tone = "neutral";
    status.textContent = `${titleCase(action)} is being committed…`;
    try {
      const result = await onReview({ rowKey: row.rowKey, action, note: reviewNote });
      dialog.close("committed");
      onReviewCommitted(result);
    } catch (error) {
      dialog.setBusy(false);
      note.setDisabled(false);
      status.dataset.tone = "error";
      status.textContent = error?.userMessage || "The inventory redemption action could not be completed.";
    }
  });

  dialog.open(opener);
  return dialog;
}

function resolvedInventory({ model, filters, state, onQueryChange, onStatusChange, onPage, onReview, onReviewCommitted }) {
  const search = AdminField({
    name: "search",
    label: "Search current page",
    type: "search",
    value: filters.query,
    placeholder: "Player, item, category on this page",
    hint: "This filter does not search records on other server pages.",
    autocomplete: "off",
    prefix: AdminIcon({ name: "search", size: 16 }),
  });
  const status = AdminField({
    name: "status",
    label: "Redemption state",
    type: "select",
    value: filters.status,
    options: STATUS_OPTIONS,
  });
  const controls = createElement("section", {
    className: "admin-inventory-route__controls",
    attrs: { "aria-label": "Inventory redemption filters" },
    children: [search.element, status.element],
  });

  let activeDialog = null;
  const table = AdminDataTable({
    caption: "Canonical inventory redemption records",
    rowKey: (row) => row.rowKey,
    columns: [
      { key: "player", label: "Player", rowHeader: true, render: (_value, row) => playerCell(row) },
      { key: "item", label: "Item", render: (_value, row) => itemCell(row) },
      {
        key: "quantity",
        label: "Requested quantity",
        align: "end",
        render: (value) => Number(value).toLocaleString("en-US"),
      },
      { key: "status", label: "State", render: (value) => statusBadge(value) },
      { key: "requestedAt", label: "Requested", render: displayDate },
      {
        key: "actions",
        label: "Actions",
        align: "end",
        render: (_value, row) => reviewActions(row, (selectedRow, action, opener) => {
          activeDialog?.destroy?.();
          activeDialog = reviewDialog({
            row: selectedRow,
            action,
            opener,
            onReview,
            onReviewCommitted,
          });
        }),
      },
    ],
    emptyState: AdminEmptyState({
      title: "No redemption records match",
      message: "Change the search or redemption-state filter.",
      compact: true,
    }),
  });

  const range = createElement("span", { className: "admin-inventory-route__range" });
  const previous = createElement("button", {
    className: "admin-button admin-button--quiet",
    attrs: { type: "button" },
    text: "Previous",
  });
  const next = createElement("button", {
    className: "admin-button admin-button--quiet",
    attrs: { type: "button" },
    text: "Next",
  });
  const pagination = createElement("nav", {
    className: "admin-inventory-route__pagination",
    attrs: { "aria-label": "Inventory redemption pages" },
    children: [previous, range, next],
  });

  function visibleRows() {
    const query = search.getValue().trim().toLowerCase();
    return model.redemptions.filter((row) => {
      if (!query) return true;
      return [
        row.player.displayName,
        row.player.reference,
        row.player.rosterLabel,
        row.item.name,
        row.item.category,
        row.item.provenance,
        row.item.type,
      ].join(" ").toLowerCase().includes(query);
    });
  }

  function applyQuery() {
    const rows = visibleRows();
    table.setRows(rows);
    onQueryChange(search.getValue());
  }

  function updatePagination() {
    const { offset, returned, hasMore } = model.pagination;
    range.textContent = returned > 0
      ? `Showing ${offset + 1}–${offset + returned}`
      : `No ${filters.status === "all" ? "history" : filters.status} records on this page`;
    const busy = state.status === ADMIN_DATA_STATES.REFRESHING;
    previous.disabled = busy || offset === 0;
    next.disabled = busy || !hasMore;
  }

  search.control.addEventListener("input", applyQuery);
  status.control.addEventListener("change", () => onStatusChange(status.getValue()));
  previous.addEventListener("click", () => onPage(-1));
  next.addEventListener("click", () => onPage(1));
  table.setRows(visibleRows());
  updatePagination();

  const root = createElement("div", {
    className: "admin-inventory-route__resolved",
    children: [summary(model), contractNotice(model), controls, table.element, pagination],
  });

  return {
    element: root,
    updateFilters(nextFilters) {
      if (search.getValue() !== nextFilters.query) search.setValue(nextFilters.query);
      if (status.getValue() !== nextFilters.status) status.setValue(nextFilters.status);
      table.setRows(visibleRows());
    },
    destroy() {
      activeDialog?.destroy?.();
      activeDialog = null;
    },
  };
}

export function InventoryRoute({
  state,
  filters,
  onQueryChange,
  onStatusChange,
  onPage,
  onRefresh,
  onReview,
  onReviewCommitted,
} = {}) {
  let resolved = null;
  const refreshButton = createElement("button", {
    className: "admin-button admin-button--quiet",
    attrs: { type: "button", disabled: state.status === ADMIN_DATA_STATES.REFRESHING },
    children: [AdminIcon({ name: "refresh", size: 17 }), state.status === ADMIN_DATA_STATES.REFRESHING ? "Refreshing…" : "Refresh"],
  });
  refreshButton.addEventListener("click", () => onRefresh());

  let content;
  if (state.status === ADMIN_DATA_STATES.INITIAL_LOADING) {
    content = InventorySkeleton();
  } else if (state.status === ADMIN_DATA_STATES.FAILED) {
    content = AdminErrorState({
      title: "Inventory supervision unavailable",
      message: state.error?.userMessage,
      requestId: state.error?.requestId,
      retryAfterSeconds: state.error?.retryAfterSeconds,
      retry: state.error?.retryable === false ? null : { label: "Try again", onClick: onRefresh },
    });
  } else {
    resolved = resolvedInventory({
      model: state.data,
      filters,
      state,
      onQueryChange,
      onStatusChange,
      onPage,
      onReview,
      onReviewCommitted,
    });
    if (state.status === ADMIN_DATA_STATES.STALE) {
      content = AdminStaleState({
        message: state.error?.userMessage || "Showing the last resolved inventory redemption data.",
        retry: { label: "Refresh", onClick: onRefresh },
        content: resolved.element,
      });
    } else if (state.status === ADMIN_DATA_STATES.REFRESHING) {
      content = createElement("div", {
        className: "admin-inventory-route__refreshing",
        children: [
          createElement("p", {
            className: "admin-inventory-route__refresh-state",
            attrs: { role: "status", "aria-live": "polite" },
            text: "Refreshing canonical inventory redemption data…",
          }),
          resolved.element,
        ],
      });
    } else {
      content = resolved.element;
    }
  }

  const page = AdminPageFrame({
    eyebrow: "Inventory operations",
    title: "Inventory",
    description: "Supervise the canonical inventory redemption workflow without creating a second inventory source of truth.",
    actions: refreshButton,
    content,
  });
  page.element.classList.add("admin-inventory-route");

  return {
    element: page.element,
    updateFilters(nextFilters) {
      resolved?.updateFilters?.(nextFilters);
    },
    destroy() {
      resolved?.destroy?.();
      resolved = null;
    },
  };
}
