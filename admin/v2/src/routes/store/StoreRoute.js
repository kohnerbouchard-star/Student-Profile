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
  return text ? text.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : fallback;
}
function displayNumber(value) { return Number.isFinite(Number(value)) ? Number(value).toLocaleString("en-US") : "—"; }
function displayAmount(value, currencyCode) {
  if (!Number.isFinite(Number(value))) return "—";
  const code = String(currencyCode || "").trim();
  const amount = Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 });
  return code ? `${amount} ${code}` : amount;
}
function mediaDescriptor(item) {
  try { return resolveStoreItemMedia({ itemKey: item.itemKey, name: item.name }); }
  catch (_error) { return resolveStoreItemMedia({ name: item.name }); }
}
function itemMedia(item, descriptor) {
  const fallbackLabel = `${item.name} Store artwork unavailable`;
  const media = AdminMedia({
    src: descriptor?.src,
    alt: descriptor?.alt || `${item.name} Store item artwork`,
    fallbackSrc: descriptor?.fallbackSrc,
    fallbackAlt: fallbackLabel,
    fallbackLabel,
    aspect: "square", fit: "cover", width: 160, height: 160,
    className: "admin-store-route__media",
  });
  const kind = String(descriptor?.kind || "placeholder").toLowerCase();
  media.dataset.mediaKind = ["seeded", "catalog", "placeholder"].includes(kind) ? kind : "placeholder";
  return media;
}
function metric(label, value, detail) {
  return createElement("article", { className: "admin-store-route__metric", children: [
    createElement("span", { text: label }), createElement("output", { text: displayNumber(value) }), createElement("small", { text: detail }),
  ] });
}
function summary(model) {
  return createElement("section", { className: "admin-store-route__summary", attrs: { "aria-label": "Store summary" }, children: [
    metric("Active items", model.summary.activeCount, "Currently purchasable"),
    metric("Out of stock", model.summary.outOfStockCount, "Available quantity is zero"),
    metric("Archived", model.summary.archivedCount, "Restorable custom items"),
    metric("Finite stock", model.summary.finiteStockCount, "Items with tracked quantities"),
  ] });
}
function storeButton({ label, icon, quiet = false, tone = null, onClick, disabled = false, disabledReason = "", action }) {
  const button = createElement("button", {
    className: `admin-button${quiet ? " admin-button--quiet" : ""}`,
    attrs: { type: "button", disabled, title: disabled && disabledReason ? disabledReason : null },
    dataset: { tone, storeAction: action },
    children: [icon ? AdminIcon({ name: icon, size: 17 }) : null, label],
  });
  button.addEventListener("click", onClick);
  return button;
}
function originLabel(item, descriptor) {
  if (descriptor.kind === "seeded") return "Included artwork · content-pack managed";
  if (descriptor.kind === "catalog") return "Catalog artwork · assigned automatically";
  return item.sourceType === "custom" ? "Custom item · branded placeholder" : "Store placeholder";
}

function catalog({ model, filters, onFiltersChange, onEdit, onArchive, onRestore, onMove, onAdd }) {
  const normalizedCategory = filters.category === "all" || model.categories.includes(filters.category) ? filters.category : "all";
  if (normalizedCategory !== filters.category) onFiltersChange({ ...filters, category: normalizedCategory });
  const search = AdminField({ name: "search", label: "Search Store items", type: "search", placeholder: "Name, description, or category", autocomplete: "off", value: filters.query, prefix: AdminIcon({ name: "search", size: 16 }) });
  const status = AdminField({
    name: "status", label: "Lifecycle and stock", type: "select", value: filters.status,
    options: [
      { value: "all", label: "All states" }, { value: "active", label: "Active" }, { value: "disabled", label: "Disabled" },
      { value: "archived", label: "Archived" }, { value: "out-of-stock", label: "Out of stock" },
    ],
  });
  const category = AdminField({
    name: "category", label: "Category", type: "select", value: normalizedCategory,
    options: [{ value: "all", label: "All categories" }, ...model.categories.map((value) => ({ value, label: titleCase(value) }))],
  });
  const clearFilters = storeButton({
    label: "Clear filters", quiet: true, icon: "close", action: "clear-filters",
    onClick() { search.setValue(""); status.setValue("all"); category.setValue("all"); applyFilters(); },
  });
  const controls = createElement("section", { className: "admin-store-route__controls", attrs: { "aria-label": "Store filters" }, children: [search.element, status.element, category.element, clearFilters] });
  const orderedActiveItems = model.items
    .filter((item) => item.status !== "archived")
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
  const activePosition = new Map(orderedActiveItems.map((item, index) => [item.rowKey, index]));
  const descriptors = new WeakMap();
  const descriptorFor = (item) => {
    if (!descriptors.has(item)) descriptors.set(item, mediaDescriptor(item));
    return descriptors.get(item);
  };

  function itemActions(item) {
    const actions = createElement("div", { className: "admin-store-route__row-actions" });
    if (item.sourceType === "seeded") {
      actions.append(createElement("span", { className: "admin-store-route__action-note", text: "Included item · read only" }));
      return actions;
    }
    if (!item.resourceId) {
      actions.append(createElement("span", { className: "admin-store-route__action-note", text: "Actions unavailable" }));
      return actions;
    }
    if (item.status === "archived") {
      actions.append(storeButton({ label: "Restore", icon: "refresh", quiet: true, action: "restore", onClick: (event) => onRestore(item, event.currentTarget) }));
      return actions;
    }
    actions.append(
      storeButton({ label: "Edit", icon: "settings", quiet: true, action: "edit", onClick: (event) => onEdit(item, event.currentTarget) }),
      storeButton({
        label: "Move earlier", icon: "sort", quiet: true, action: "move-up",
        disabled: activePosition.get(item.rowKey) === 0,
        disabledReason: "This item is already first in display order.",
        onClick: () => onMove(item, "up"),
      }),
      storeButton({
        label: "Move later", icon: "sort", quiet: true, action: "move-down",
        disabled: activePosition.get(item.rowKey) === orderedActiveItems.length - 1,
        disabledReason: "This item is already last in display order.",
        onClick: () => onMove(item, "down"),
      }),
      storeButton({ label: "Archive", icon: "warning", quiet: true, tone: "danger", action: "archive", onClick: (event) => onArchive(item, event.currentTarget) }),
    );
    return actions;
  }

  const table = AdminDataTable({
    caption: "Store Management items",
    rowKey: (item) => item.rowKey,
    columns: [
      { key: "artwork", label: "Artwork", sortable: false, render: (_value, item) => itemMedia(item, descriptorFor(item)) },
      {
        key: "name", label: "Item", rowHeader: true,
        render: (_value, item) => createElement("div", { className: "admin-store-route__item-copy", children: [
          createElement("strong", { text: item.name }),
          item.description ? createElement("small", { text: item.description }) : null,
          createElement("span", { className: "admin-store-route__origin", text: originLabel(item, descriptorFor(item)) }),
        ] }),
      },
      { key: "category", label: "Category", render: (value) => titleCase(value) },
      { key: "price", label: "Price", align: "end", render: (value, item) => displayAmount(value, item.currencyCode) },
      { key: "stockQuantity", label: "Stock", align: "end", render: (value) => value === 0 ? "0 · Out of stock" : displayNumber(value) },
      { key: "sortOrder", label: "Order", align: "end", render: displayNumber },
      {
        key: "status", label: "State",
        render: (value, item) => createElement("span", { className: "admin-store-route__status", dataset: { status: value || "unknown" }, text: `${titleCase(value)} · ${titleCase(item.visibility)}` }),
      },
      {
        key: "purchaseStats", label: "Usage", align: "end", sortable: false,
        render: (value, item) => createElement("div", { className: "admin-store-route__usage", children: [
          createElement("span", { text: `${displayNumber(value.purchaseCount)} purchases` }),
          createElement("small", { text: `${displayNumber(value.unitsSold)} sold · ${displayAmount(value.revenue, item.currencyCode)}` }),
        ] }),
      },
      { key: "actions", label: "Actions", align: "end", sortable: false, render: (_value, item) => itemActions(item) },
    ],
    emptyState: AdminEmptyState({ title: "No Store items match", message: "Try changing the search or filters.", compact: true }),
  });

  function applyFilters() {
    const query = search.getValue().trim().toLowerCase();
    const selectedStatus = status.getValue();
    const selectedCategory = category.getValue();
    const visibleItems = model.items.filter((item) => {
      const searchable = [item.name, item.description, item.category].join(" ").toLowerCase();
      const queryMatches = !query || searchable.includes(query);
      const statusMatches = selectedStatus === "all" || (selectedStatus === "out-of-stock" ? item.status !== "archived" && item.stockQuantity === 0 : item.status === selectedStatus);
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

  const root = createElement("div", { className: "admin-store-route__resolved", children: [summary(model), controls] });
  if (model.isEmpty) {
    root.append(AdminEmptyState({ title: "No Store items yet", message: "Add the first item to this game’s Store catalog.", action: { label: "Add Item", onClick: onAdd } }));
  } else {
    root.append(createElement("section", { className: "admin-store-route__catalog", attrs: { "aria-label": "Store items" }, children: table.element }));
  }
  return root;
}

export function StoreRoute({
  state,
  filters = { query: "", status: "all", category: "all" },
  onFiltersChange = () => {},
  onRefresh = async () => {},
  onCreate = async () => ({ ok: false }),
  onEdit = async () => ({ ok: false }),
  onArchive = async () => ({ ok: false }),
  onRestore = async () => ({ ok: false }),
  onMove = async () => ({ ok: false }),
} = {}) {
  let destroyed = false;
  let activeFormDialog = null;
  let lifecycleDialog = null;
  let lifecycleTarget = null;

  function closeAndDestroyFormDialog() {
    const active = activeFormDialog;
    activeFormDialog = null;
    active?.dialog.destroy();
  }
  function openItemDialog(mode, item, opener) {
    closeAndDestroyFormDialog();
    let dialog;
    const submit = mode === "edit" ? (input) => onEdit(item, input) : (input) => onCreate(input);
    const form = StoreItemForm({
      mode, item,
      onCancel() { dialog.close("cancelled"); },
      async onSubmit(input) {
        dialog.setBusy(true);
        const result = await submit(input);
        if (result?.ok === true) dialog.close("saved");
        else dialog.setBusy(false);
        return result;
      },
    });
    dialog = AdminDialog({
      title: mode === "edit" ? "Edit Store item" : "Add Store item",
      description: mode === "edit"
        ? "Change the Store fields that are persisted for this custom item."
        : "Create a teacher-managed Store item. Artwork is assigned automatically by the media catalog.",
      content: form.element, footer: form.footer, size: "large", className: "admin-store-dialog",
      initialFocus: () => form.fields.name.control,
      onClose() { queueMicrotask(() => { if (activeFormDialog?.dialog === dialog) closeAndDestroyFormDialog(); }); },
    });
    activeFormDialog = { dialog, form };
    dialog.open(opener);
  }
  function addItem(opener) { openItemDialog("create", null, opener instanceof HTMLElement ? opener : document.activeElement); }
  function editItem(item, opener) { openItemDialog("edit", item, opener); }

  function ensureLifecycleDialog() {
    if (lifecycleDialog) return lifecycleDialog;
    lifecycleDialog = AdminConfirmDialog({
      title: "Change Store item lifecycle",
      message: "Apply this change?",
      confirmLabel: "Apply",
      failureMessage: "The Store item lifecycle could not be changed.",
      async onConfirm() {
        if (!lifecycleTarget) return false;
        const result = lifecycleTarget.action === "archive" ? await onArchive(lifecycleTarget.item) : await onRestore(lifecycleTarget.item);
        if (result?.ok !== true) throw new Error("STORE_LIFECYCLE_FAILED");
        return true;
      },
    });
    return lifecycleDialog;
  }
  function archiveItem(item, opener) {
    lifecycleTarget = { action: "archive", item };
    const confirm = ensureLifecycleDialog();
    confirm.setTitle("Archive Store item");
    confirm.setMessage(`Archive ${item.name}?`);
    confirm.setDetail("The item will be hidden and no longer purchasable. This is a reversible soft archive.");
    confirm.setConfirmLabel("Archive item");
    confirm.setTone("danger");
    void confirm.open(opener).then(() => { lifecycleTarget = null; });
  }
  function restoreItem(item, opener) {
    lifecycleTarget = { action: "restore", item };
    const confirm = ensureLifecycleDialog();
    confirm.setTitle("Restore Store item");
    confirm.setMessage(`Restore ${item.name}?`);
    confirm.setDetail("The item will return as active and visible. Review its price and stock after restoration if needed.");
    confirm.setConfirmLabel("Restore item");
    confirm.setTone("success");
    void confirm.open(opener).then(() => { lifecycleTarget = null; });
  }

  const addButton = storeButton({ label: "Add Item", icon: "plus", action: "add", onClick: (event) => addItem(event.currentTarget) });
  const refreshButton = storeButton({ label: state.status === ADMIN_DATA_STATES.REFRESHING ? "Refreshing…" : "Refresh", icon: "refresh", quiet: true, action: "refresh", disabled: state.status === ADMIN_DATA_STATES.REFRESHING, onClick: onRefresh });
  const route = createElement("div", { className: "admin-store-route", dataset: { adminV2State: state.status }, attrs: { "aria-busy": [ADMIN_DATA_STATES.INITIAL_LOADING, ADMIN_DATA_STATES.REFRESHING].includes(state.status) } });
  if (state.status === ADMIN_DATA_STATES.INITIAL_LOADING) route.append(StoreSkeleton());
  else if (state.status === ADMIN_DATA_STATES.FAILED) route.append(AdminErrorState({
    title: "Store Management could not be loaded", message: state.error?.userMessage, requestId: state.error?.requestId, retryAfterSeconds: state.error?.retryAfterSeconds,
    retry: state.error?.retryable ? { label: "Retry Store", onClick: onRefresh } : null,
  }));
  else if (state.data) {
    const content = catalog({ model: state.data, filters, onFiltersChange, onEdit: editItem, onArchive: archiveItem, onRestore: restoreItem, onMove, onAdd: (event) => addItem(event?.currentTarget) });
    if (state.status === ADMIN_DATA_STATES.STALE) route.append(AdminStaleState({ message: state.error?.userMessage || "Showing the last Store snapshot. Refresh before changing an item.", retry: { label: "Retry", onClick: onRefresh }, content }));
    else {
      if (state.status === ADMIN_DATA_STATES.REFRESHING) route.append(createElement("div", { className: "admin-store-route__refresh-state", attrs: { role: "status" }, children: [AdminIcon({ name: "refresh", size: 17 }), "Refreshing Store data…"] }));
      route.append(content);
    }
  }
  const pageFrame = AdminPageFrame({
    eyebrow: "Game administration", title: "Store Management",
    description: "Manage custom Store items, stock, price, visibility, ordering, and reversible archive state. Included content-pack items remain read only.",
    actions: [refreshButton, addButton], content: route,
  });
  return {
    ...pageFrame,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      closeAndDestroyFormDialog();
      lifecycleDialog?.destroy();
      lifecycleDialog = null;
      lifecycleTarget = null;
    },
  };
}
