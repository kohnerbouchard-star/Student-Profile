import {
  AdminDataTable,
  AdminEmptyState,
  AdminErrorState,
  AdminField,
  AdminIcon,
  AdminPageFrame,
  AdminStaleState,
} from "../../components/index.js";
import { createElement } from "../../components/dom.js";
import { ADMIN_DATA_STATES } from "../../core/data-state.js";
import { LogsSkeleton } from "./LogsSkeleton.js";

function safeText(value, fallback = "", maximum = 500) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return (text || fallback).slice(0, maximum);
}

function formatTimestamp(value) {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) return "Timestamp unavailable";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function localDateTimeValue(value) {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function isoFromLocal(value) {
  const source = safeText(value, "", 40);
  if (!source) return "";
  const date = new Date(source);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function logsButton({ label, icon, quiet = false, disabled = false, onClick, type = "button" }) {
  const button = createElement("button", {
    className: `admin-button${quiet ? " admin-button--quiet" : ""}`,
    attrs: { type, disabled },
    children: [icon ? AdminIcon({ name: icon, size: 16 }) : null, label],
  });
  if (onClick) button.addEventListener("click", onClick);
  return button;
}

function metric(label, value, detail) {
  return createElement("article", {
    className: "admin-logs-route__metric",
    children: [
      createElement("span", { text: label }),
      createElement("output", { text: String(value) }),
      createElement("small", { text: detail }),
    ],
  });
}

function activeFilterCount(filters) {
  return [filters?.search, filters?.action, filters?.actorType, filters?.targetType, filters?.startAt, filters?.endAt]
    .filter(Boolean).length;
}

function summary(model, filters) {
  const pagination = model.pagination;
  return createElement("section", {
    className: "admin-logs-route__summary",
    attrs: { "aria-label": "Audit log summary" },
    children: [
      metric("Audit events", pagination.total.toLocaleString(), "Server-reported total"),
      metric("Page", `${pagination.page} / ${pagination.totalPages}`, "Current result page"),
      metric("Page size", pagination.pageSize.toLocaleString(), "Rows requested per page"),
      metric("Active filters", activeFilterCount(filters).toLocaleString(), "Search and exact filters"),
    ],
  });
}

function readOnlyNotice() {
  return createElement("aside", {
    className: "admin-logs-route__notice",
    attrs: { role: "note", "aria-label": "Read-only audit boundary" },
    children: [
      AdminIcon({ name: "info", size: 18 }),
      createElement("p", {
        children: [
          createElement("strong", { text: "Read-only operational record" }),
          createElement("span", {
            text: "This V2 surface suppresses internal identifiers and sensitive authentication or backend diagnostic material. Log editing, deletion, flag mutation, and raw CSV export are not exposed here.",
          }),
        ],
      }),
    ],
  });
}

function metadataCell(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return createElement("span", { className: "admin-u-muted", text: "No safe metadata" });
  }
  return createElement("dl", {
    className: "admin-logs-route__metadata",
    children: entries.map((entry) => createElement("div", {
      children: [
        createElement("dt", { text: safeText(entry.label, "Metadata", 80) }),
        createElement("dd", { text: safeText(entry.value, "Not available", 320) }),
      ],
    })),
  });
}

function statusPill(value) {
  const label = safeText(value, "Not reported", 120);
  const normalized = label.toLocaleLowerCase();
  const tone = /success|succeed|complete|approved|ok/.test(normalized)
    ? "positive"
    : /fail|error|denied|reject|cancel/.test(normalized)
      ? "negative"
      : "neutral";
  return createElement("span", {
    className: "admin-logs-route__status",
    dataset: { tone },
    text: label,
  });
}

function filterPanel(filters, onApplyFilters, onClearFilters) {
  const search = AdminField({
    name: "logs-search",
    label: "Search action text",
    type: "search",
    value: safeText(filters?.search, "", 120),
    placeholder: "Example: attendance or store",
    autocomplete: "off",
    prefix: AdminIcon({ name: "search", size: 16 }),
  });
  const action = AdminField({
    name: "logs-action",
    label: "Exact action",
    value: safeText(filters?.action, "", 160),
    placeholder: "Example: store.item.updated",
    autocomplete: "off",
  });
  const actorType = AdminField({
    name: "logs-actor-type",
    label: "Actor type",
    type: "select",
    value: safeText(filters?.actorType, "", 80),
    options: [
      { value: "", label: "Any actor type" },
      { value: "staff", label: "Staff" },
      { value: "player", label: "Player" },
      { value: "system", label: "System" },
    ],
  });
  const targetType = AdminField({
    name: "logs-target-type",
    label: "Target/resource type",
    value: safeText(filters?.targetType, "", 80),
    placeholder: "Example: store_item, player, attendance",
    hint: "Use the exact resource type shown in the Action/Target columns when narrowing further.",
    autocomplete: "off",
  });
  const startAt = AdminField({
    name: "logs-start-at",
    label: "From",
    type: "datetime-local",
    value: localDateTimeValue(filters?.startAt),
  });
  const endAt = AdminField({
    name: "logs-end-at",
    label: "To",
    type: "datetime-local",
    value: localDateTimeValue(filters?.endAt),
  });
  const pageSize = AdminField({
    name: "logs-page-size",
    label: "Rows per page",
    type: "select",
    value: String(filters?.pageSize || 50),
    options: [25, 50, 100, 200].map((value) => ({ value: String(value), label: String(value) })),
  });

  const form = createElement("form", {
    className: "admin-logs-route__filters",
    attrs: { "aria-label": "Audit log filters" },
    children: [
      search.element,
      action.element,
      actorType.element,
      targetType.element,
      startAt.element,
      endAt.element,
      pageSize.element,
    ],
  });
  const actions = createElement("div", {
    className: "admin-logs-route__filter-actions",
    children: [
      logsButton({ label: "Apply filters", icon: "search", type: "submit" }),
      logsButton({
        label: "Clear filters",
        quiet: true,
        onClick() { onClearFilters?.(); },
      }),
    ],
  });
  form.append(actions);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const start = isoFromLocal(startAt.getValue());
    const end = isoFromLocal(endAt.getValue());
    if (start && end && Date.parse(start) > Date.parse(end)) {
      endAt.setError("The end time must be after the start time.");
      endAt.focus();
      return;
    }
    endAt.setError("");
    onApplyFilters?.({
      search: search.getValue(),
      action: action.getValue(),
      actorType: actorType.getValue(),
      targetType: targetType.getValue(),
      startAt: start,
      endAt: end,
      pageSize: Number(pageSize.getValue()),
    });
  });
  return form;
}

function logTable(model) {
  return AdminDataTable({
    caption: "Read-only administrator audit events",
    rows: model.logs,
    rowKey: (row) => row.rowKey,
    columns: [
      {
        key: "timestamp",
        label: "Timestamp",
        rowHeader: true,
        width: "12.5rem",
        render: (value) => createElement("time", {
          text: formatTimestamp(value),
          attrs: value ? { datetime: value } : {},
        }),
      },
      { key: "actor", label: "Actor", render: (value) => safeText(value, "Unknown actor", 120) },
      {
        key: "action",
        label: "Action",
        render: (value) => createElement("code", { className: "admin-logs-route__action", text: safeText(value, "Action unavailable", 240) }),
      },
      { key: "target", label: "Target / resource", render: (value) => safeText(value, "General operation", 160) },
      { key: "category", label: "Category", render: (value) => safeText(value, "General", 120) },
      { key: "outcome", label: "Status / outcome", render: statusPill },
      { key: "metadata", label: "Safe metadata", render: metadataCell },
    ],
    emptyState: AdminEmptyState({
      title: "No audit events match",
      message: "Try changing the current action, actor, resource, or time filters.",
      compact: true,
    }),
  }).element;
}

function pagination(model, onPageChange) {
  const { page, totalPages, hasPreviousPage, hasNextPage } = model.pagination;
  return createElement("nav", {
    className: "admin-logs-route__pagination",
    attrs: { "aria-label": "Audit log pagination" },
    children: [
      createElement("p", { text: `Page ${page.toLocaleString()} of ${totalPages.toLocaleString()}` }),
      createElement("div", {
        children: [
          logsButton({
            label: "Previous",
            icon: "chevronLeft",
            quiet: true,
            disabled: !hasPreviousPage,
            onClick() { onPageChange?.(Math.max(1, page - 1)); },
          }),
          logsButton({
            label: "Next",
            icon: "chevronRight",
            quiet: true,
            disabled: !hasNextPage,
            onClick() { onPageChange?.(Math.min(totalPages, page + 1)); },
          }),
        ],
      }),
    ],
  });
}

function resolvedContent(model, filters, callbacks) {
  return createElement("div", {
    className: "admin-logs-route__resolved",
    children: [
      summary(model, filters),
      readOnlyNotice(),
      createElement("section", {
        className: "admin-logs-route__panel",
        attrs: { "aria-labelledby": "admin-logs-events-title" },
        children: [
          createElement("header", {
            className: "admin-logs-route__section-head",
            children: [
              createElement("div", {
                children: [
                  createElement("span", { text: "Authoritative audit read" }),
                  createElement("h2", { attrs: { id: "admin-logs-events-title" }, text: "Operational events" }),
                ],
              }),
              createElement("p", { text: `${model.logs.length.toLocaleString()} rows on this page` }),
            ],
          }),
          filterPanel(filters, callbacks.onApplyFilters, callbacks.onClearFilters),
          model.isEmpty
            ? AdminEmptyState({
              title: "No audit events are available",
              message: "The authoritative audit read returned no events for the selected game and filters.",
            })
            : logTable(model),
          pagination(model, callbacks.onPageChange),
        ],
      }),
    ],
  });
}

function safeErrorMessage(error) {
  return safeText(error?.userMessage, "The audit log could not be loaded safely. Try again.", 360);
}

export function LogsRoute({ state, filters, onRefresh, onApplyFilters, onClearFilters, onPageChange } = {}) {
  const root = createElement("section", {
    className: "admin-logs-route",
    dataset: { adminV2State: state?.status || ADMIN_DATA_STATES.INITIAL_LOADING },
  });
  let content;

  if (!state || state.status === ADMIN_DATA_STATES.INITIAL_LOADING) {
    content = LogsSkeleton();
  } else if (state.status === ADMIN_DATA_STATES.FAILED) {
    content = AdminErrorState({
      title: "Audit logs are unavailable",
      message: safeErrorMessage(state.error),
      requestId: state.error?.requestId,
      retryAfterSeconds: state.error?.retryAfterSeconds,
      retry: state.error?.retryable ? { label: "Retry logs", onClick: onRefresh } : null,
    });
  } else {
    const resolved = resolvedContent(state.data, filters, { onApplyFilters, onClearFilters, onPageChange });
    if (state.status === ADMIN_DATA_STATES.STALE) {
      content = AdminStaleState({
        message: "Showing the last safe audit page because the latest refresh failed.",
        retry: state.error?.retryable ? { label: "Retry logs", onClick: onRefresh } : null,
        content: resolved,
      });
    } else if (state.status === ADMIN_DATA_STATES.REFRESHING) {
      content = createElement("div", {
        className: "admin-logs-route__resolved",
        children: [
          createElement("div", {
            className: "admin-logs-route__refresh-state",
            attrs: { role: "status", "aria-live": "polite" },
            children: [AdminIcon({ name: "refresh", size: 16 }), "Refreshing audit events…"],
          }),
          resolved,
        ],
      });
    } else {
      content = resolved;
    }
  }

  const refreshButton = logsButton({
    label: "Refresh",
    icon: "refresh",
    quiet: true,
    disabled: state?.status === ADMIN_DATA_STATES.INITIAL_LOADING || state?.status === ADMIN_DATA_STATES.REFRESHING,
    onClick: onRefresh,
  });
  const frame = AdminPageFrame({
    eyebrow: "System",
    title: "Logs",
    description: "Read-only audit and operational events for the selected game. Sensitive identifiers, credentials, backend diagnostics, and unsafe metadata are intentionally suppressed.",
    actions: refreshButton,
    content,
  });
  root.append(frame.element);
  return Object.freeze({ element: root, destroy() {} });
}
