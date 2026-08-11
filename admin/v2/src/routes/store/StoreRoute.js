import {
  AdminConfirmDialog,
  AdminDataTable,
  AdminDialog,
  AdminEmptyState,
  AdminErrorState,
  AdminField,
  AdminIcon,
  AdminMedia,
  AdminPageFrame,
  AdminStaleState,
} from "../../components/index.js";
import { createElement } from "../../components/dom.js";
import { ADMIN_DATA_STATES } from "../../core/data-state.js";
import { resolveStoreItemMedia } from "../../../../../player-terminal/assets/store-item-media.mjs";
import { StoreItemForm } from "./StoreItemForm.js";
import { StoreSkeleton } from "./StoreSkeleton.js";

function titleCase(value, fallback = "Not available") {
  const text = String(value || "").trim();
  return text
    ? text.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
    : fallback;
}

function displayNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString("en-US") : "—";
}

function displayAmount(value, currencyCode) {
  if (!Number.isFinite(Number(value))) return "—";
  const code = String(currencyCode || "").trim();
  const amount = Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 });
  return code ? `${amount} ${code}` : amount;
}

function mediaDescriptor(item) {
  try {
    return resolveStoreItemMedia({ itemKey: item.itemKey, name: item.name });
  } catch (_error) {
    return resolveStoreItemMedia({ name: item.name });
  }
}

function itemMedia(item, descriptor) {
  const fallbackLabel = `${item.name} Store artwork unavailable`;
  const media = AdminMedia({
    src: descriptor?.src,
    alt: descriptor?.alt || `${item.name} Store item artwork`,
    fallbackSrc: descriptor?.fallbackSrc,
    fallbackAlt: fallbackLabel,
    fallbackLabel,
    aspect: "square",
    fit: "cover",
    width: 160,
    height: 160,
    className: "admin-store-route__media",
  });
  const kind = String(descriptor?.kind || "placeholder").toLowerCase();
  media.dataset.mediaKind = ["seeded", "catalog", "placeholder"].includes(kind) ? kind : "placeholder";
  return media;
}

function metric(label, value, detail) {
  return createElement("article", {
    className: "admin-store-route__metric",
    children: [
      createElement("span", { text: label }),
      createElement("output", { text: displayNumber(value) }),
      createElement("small", { text: detail }),
    ],
  });
}

function summary(model) {
  return createElement("section", {
    className: "admin-store-route__summary",
    attrs: { "aria-label": "Store summary" },
    children: [
      metric("Active items", model.summary.activeCount, "Currently active"),
      metric("Out of stock", model.summary.outOfStockCount, "Available quantity is zero"),
      metric("Finite stock", model.summary.finiteStockCount, "Items with tracked quantity"),
    ],
  });
}

function storeButton({ label, icon, quiet = false, tone = null, onClick, disabled = false, action }) {
  const button = createElement("button", {
    className: `admin-button${quiet ? " admin-button--quiet" : ""}`,
    attrs: { type: "button", disabled },
    dataset: { tone, storeAction: action },
    children: [icon ? AdminIcon({ name: icon, size: 17 }) : null, label],
  });
  button.addEventListener("click", onClick);
  return button;
}

function catalog({ model, filters, onFiltersChange, onEdit, onArchive, onAdd }) {
  const normalizedCategory = filters.category === "all" || model.categories.includes(filters.category)
    ? filters.category
    : "all";
  if (normalizedCategory !== filters.category) {
    onFiltersChange({ ...filters, category: normalizedCategory });
  }

  const search = AdminField({
    name: "search",
    label: "Search Store items",
    type: "search",
    placeholder: "Name, description, or category",
    autocomplete: "off",
    value: filters.query,
    prefix: AdminIcon({ name: "search", size: 16 }),
  });
  const status = AdminField({
    name: "status",
    label: "Status and stock",
    type: "select",
    value: filters.status,
    options: [
      { value: "all", label: "All states" },
      { value: "active", label: "Active" },
      { value: "disabled", label: "Disabled" },
      { value: "archived", label: "Archived" },
      { value: "out-of-stock", label: "Out of stock" },
    ],
  });
  const category = AdminField({
    name: "category",
    label: "Category",
    type: "select",
    value: normalizedCategory,
    options: [
      { value: "all", label: "All categories" },
      ...model.categories.map((value) => ({ value, label: titleCase(value) })),
    ],
  });
  const controls = createElement("section", {
    className: "admin-store-route__controls",
    attrs: { "aria-label": "Store filters" },
    children: [search.element, status.element, category.element],
  });

  let visibleItems = [];
  const descriptors = new WeakMap();
  const descriptorFor = (item) => {
    if (!descriptors.has(item)) descriptors.set(item, mediaDescriptor(item));
    return descriptors.get(item);
  };

  function itemActions(item) {
    const actions = createElement("div", { className: "admin-store-route__row-actions" });
    if (item.sourceType === "seeded") {
      actions.append(createElement("span", {
        className: "admin-store-route__action-note",
        text: "Included content · definition locked",
      }));
      return actions;
    }
    if (!item.resourceId || item.status === "archived") {
      actions.append(createElement("span", {
        className: "admin-store-route__action-note",
        text: item.status === "archived" ? "Archived" : "Actions unavailable",
      }));
      return actions;
    }
    actions.append(
      storeButton({
        label: "Edit",
        icon: "settings",
        quiet: true,
        action: "edit",
        onClick(event) { onEdit(item, event.currentTarget); },
      }),
      storeButton({
        label: "Archive",
        icon: "warning",
        quiet: true,
        tone: "danger",
        action: "archive",
        onClick(event) { onArchive(item, event.currentTarget); },
      }),
    );
    return actions;
  }

  const table = AdminDataTable({
    caption: "Store items for the current simulation",
    rowKey: (item) => item.rowKey,
    columns: [
      {
        key: "artwork",
        label: "Artwork",
        render: (_value, item) => itemMedia(item, descriptorFor(item)),
      },
      {
        key: "name",
        label: "Item",
        rowHeader: true,
        render: (_value, item) => createElement("div", {
          className: "admin-store-route__item-copy",
          children: [
            createElement("strong", { text: item.name }),
            item.description ? createElement("small", { text: item.description }) : null,
            createElement("span", {
              className: "admin-store-route__origin",
              text: item.sourceType === "seeded"
                ? "Included content"
                : item.sourceType === "custom"
                  ? "Teacher-created"
                  : descriptorFor(item).kind === "catalog"
                    ? "Catalog artwork"
                    : "Store item",
            }),
          ],
        }),
      },
      { key: "category", label: "Category", render: (value) => titleCase(value) },
      {
        key: "price",
        label: "Price",
        align: "end",
        render: (value, item) => displayAmount(value, item.currencyCode),
      },
      {
        key: "stockQuantity",
        label: "Stock",
        align: "end",
        render: (value) => value === 0 ? "0 · Out of stock" : displayNumber(value),
      },
      {
        key: "status",
        label: "State",
        render: (value, item) => createElement("span", {
          className: "admin-store-route__status",
          dataset: { status: value || "unknown" },
          text: `${titleCase(value)} · ${titleCase(item.visibility)}`,
        }),
      },
      {
        key: "purchaseStats",
        label: "Usage",
        align: "end",
        render: (value, item) => createElement("div", {
          className: "admin-store-route__usage",
          children: [
            createElement("span", { text: `${displayNumber(value.purchaseCount)} purchases` }),
            createElement("small", { text: `${displayNumber(value.unitsSold)} sold · ${displayAmount(value.revenue, item.currencyCode)}` }),
          ],
        }),
      },
      { key: "actions", label: "Actions", align: "end", render: (_value, item) => itemActions(item) },
    ],
    emptyState: AdminEmptyState({
      title: "No Store items match",
      message: "Try changing the search or filters.",
      compact: true,
    }),
  });

  function applyFilters() {
    const query = search.getValue().trim().toLowerCase();
    const selectedStatus = status.getValue();
    const selectedCategory = category.getValue();
    visibleItems = model.items.filter((item) => {
      const searchable = [item.name, item.description, item.category].join(" ").toLowerCase();
      const queryMatches = !query || searchable.includes(query);
      const statusMatches = selectedStatus === "all"
        || (selectedStatus === "out-of-stock"
          ? item.status !== "archived" && item.stockQuantity === 0
          : item.status === selectedStatus);
      const categoryMatches = selectedCategory === "all" || item.category === selectedCategory;
      return queryMatches && statusMatches && categoryMatches;
    });
    table.setRows(visibleItems);
    onFiltersChange({ query: search.getValue(), status: selectedStatus, category: selectedCategory });
  }

  search.control.addEventListener("input", applyFilters);
  status.control.addEventListener("change", applyFilters);
  category.control.addEventListener("change", applyFilters);
  applyFilters();

  const root = createElement("div", {
    className: "admin-store-route__resolved",
    children: [summary(model), controls],
  });
  if (model.isEmpty) {
    root.append(AdminEmptyState({
      title: "No Store items yet",
      message: "Add the first custom item to this simulation's Store.",
      action: { label: "Add Item", onClick: onAdd },
    }));
  } else {
    root.append(createElement("section", {
      className: "admin-store-route__catalog",
      attrs: { "aria-label": "Store items" },
      children: table.element,
    }));
  }
  return root;
}

/** Renders Store Management from the shared six-state contract. */
export function StoreRoute({
  state,
  filters = { query: "", status: "all", category: "all" },
  onFiltersChange = () => {},
  onRefresh = async () => {},
  onCreate = async () => ({ ok: false }),
  onEdit = async () => ({ ok: false }),
  onArchive = async () => ({ ok: false }),
} = {}) {
  let destroyed = false;
  let activeFormDialog = null;
  let archiveDialog = null;
  let archiveTarget = null;

  function closeAndDestroyFormDialog() {
    const active = activeFormDialog;
    activeFormDialog = null;
    active?.dialog.destroy();
  }

  function openItemDialog(mode, item, opener) {
    closeAndDestroyFormDialog();
    let dialog;
    let form;
    const submit = mode === "edit"
      ? (input) => onEdit(item, input)
      : (input) => onCreate(input);
    form = StoreItemForm({
      mode,
      item,
      onCancel() { dialog.close("cancelled"); },
      async onSubmit(input) {
        dialog.setBusy(true);
        const result = await submit(input);
        if (result?.ok === true) {
          dialog.close("saved");
        } else {
          dialog.setBusy(false);
        }
        return result;
      },
    });
    dialog = AdminDialog({
      title: mode === "edit" ? "Edit Store item" : "Add Store item",
      description: mode === "edit"
        ? "Update this teacher-created Store item. Included simulation items are locked."
        : "Create a custom Store item for this simulation. Included simulation content remains unchanged.",
      content: form.element,
      footer: form.footer,
      size: "large",
      className: "admin-store-dialog",
      initialFocus: () => form.fields.name.control,
      onClose() {
        queueMicrotask(() => {
          if (activeFormDialog?.dialog === dialog) closeAndDestroyFormDialog();
        });
      },
    });
    dialog.element.dataset.storeDialog = mode;
    activeFormDialog = { dialog, form };
    dialog.open(opener);
  }

  function addItem(opener) {
    openItemDialog("create", null, opener instanceof HTMLElement ? opener : document.activeElement);
  }

  function editItem(item, opener) {
    if (item?.sourceType === "seeded") return;
    openItemDialog("edit", item, opener);
  }

  function ensureArchiveDialog() {
    if (archiveDialog) return archiveDialog;
    archiveDialog = AdminConfirmDialog({
      title: "Archive Store item",
      message: "Archive this Store item?",
      detail: "Archived custom items are hidden from the active Store catalog.",
      confirmLabel: "Archive item",
      failureMessage: "The Store item could not be archived. Try again.",
      async onConfirm() {
        const result = await onArchive(archiveTarget);
        if (result?.ok !== true) throw new Error("STORE_ARCHIVE_FAILED");
        return true;
      },
    });
    archiveDialog.element.dataset.storeDialog = "archive";
    return archiveDialog;
  }

  function archiveItem(item, opener) {
    if (item?.sourceType === "seeded") return;
    archiveTarget = item;
    const confirm = ensureArchiveDialog();
    confirm.setTitle("Archive Store item");
    confirm.setMessage(`Archive ${item.name}?`);
    confirm.setDetail("The custom item will be hidden from the active Store catalog. Its history is preserved.");
    void confirm.open(opener).then(() => {
      archiveTarget = null;
    });
  }

  const addButton = storeButton({
    label: "Add Item",
    icon: "plus",
    action: "add",
    onClick(event) { addItem(event.currentTarget); },
  });
  const refreshButton = storeButton({
    label: state.status === ADMIN_DATA_STATES.REFRESHING ? "Refreshing…" : "Refresh",
    icon: "refresh",
    quiet: true,
    action: "refresh",
    disabled: state.status === ADMIN_DATA_STATES.REFRESHING,
    onClick: onRefresh,
  });
  const route = createElement("div", {
    className: "admin-store-route",
    dataset: { adminV2State: state.status },
    attrs: {
      "aria-busy": [ADMIN_DATA_STATES.INITIAL_LOADING, ADMIN_DATA_STATES.REFRESHING].includes(state.status),
    },
  });

  if (state.status === ADMIN_DATA_STATES.INITIAL_LOADING) {
    route.append(StoreSkeleton());
  } else if (state.status === ADMIN_DATA_STATES.FAILED) {
    route.append(AdminErrorState({
      title: "Store could not be loaded",
      message: state.error?.userMessage,
      requestId: state.error?.requestId,
      retryAfterSeconds: state.error?.retryAfterSeconds,
      retry: state.error?.retryable ? { label: "Retry Store", onClick: onRefresh } : null,
    }));
  } else if (state.data) {
    const content = catalog({
      model: state.data,
      filters,
      onFiltersChange,
      onEdit: editItem,
      onArchive: archiveItem,
      onAdd: (event) => addItem(event?.currentTarget),
    });
    if (state.status === ADMIN_DATA_STATES.STALE) {
      route.append(AdminStaleState({
        message: state.error?.userMessage || "Showing the last loaded Store catalog while refresh is unavailable.",
        retry: { label: "Retry", onClick: onRefresh },
        content,
      }));
    } else {
      if (state.status === ADMIN_DATA_STATES.REFRESHING) {
        route.append(createElement("div", {
          className: "admin-store-route__refresh-state",
          attrs: { role: "status" },
          children: [AdminIcon({ name: "refresh", size: 17 }), "Refreshing Store data…"],
        }));
      }
      route.append(content);
    }
  }

  const pageFrame = AdminPageFrame({
    eyebrow: "Store & Inventory",
    title: "Store",
    description: "Manage custom Store items for this simulation. Included content stays locked while prices and availability remain governed by the simulation.",
    actions: [addButton, refreshButton],
    content: route,
  });

  return {
    ...pageFrame,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      closeAndDestroyFormDialog();
      archiveDialog?.destroy();
      archiveDialog = null;
      archiveTarget = null;
    },
  };
}
