import { AdminDataTable, AdminEmptyState, AdminField, AdminIcon } from "../../components/index.js";
import { createElement } from "../../components/dom.js";
import { formatTime, number, safeText, statusBadge, titleCase, typeBadge } from "./NewsEventsViewHelpers.js";
import { openDetail } from "./NewsEventsDetail.js";

function combinedRows(model) {
  const events = (model?.events || []).map((event) => ({
    ...event,
    type: "event",
    title: titleCase(event.eventKey, "World event"),
    detail: event.reason || `${titleCase(event.fromPhase)} → ${titleCase(event.toPhase)}`,
    status: event.lifecycle,
    scope: event.toPhase === "unknown" ? "world" : event.toPhase,
    timestamp: event.occurredAt || event.createdAt,
  }));
  const news = (model?.news || []).map((item) => ({
    ...item,
    type: "news",
    title: item.newsDefinitionId,
    detail: item.lastErrorCode
      ? `Delivery error: ${titleCase(item.lastErrorCode)}`
      : `${titleCase(item.audience)} audience`,
    status: item.lifecycle,
    scope: item.audience,
    timestamp: item.completedAt || item.claimedAt || item.createdAt,
  }));
  return [...news, ...events].sort((left, right) => {
    const a = Date.parse(left.timestamp || "") || 0;
    const b = Date.parse(right.timestamp || "") || 0;
    return b - a;
  });
}

function scopeOptions(rows) {
  const values = [...new Set(rows.map((row) => safeText(row.scope, "", 80)).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
  return [
    { value: "all", label: "All scopes" },
    ...values.map((value) => ({ value, label: titleCase(value) })),
  ];
}

function controls({ rows, filters, onFiltersChange, table }) {
  const search = AdminField({
    name: "news-events-search",
    label: "Search News & Events",
    type: "search",
    placeholder: "Event key, definition, phase, audience, or reason",
    autocomplete: "off",
    value: safeText(filters?.query, "", 160),
    prefix: AdminIcon({ name: "search", size: 16 }),
  });
  const type = AdminField({
    name: "news-events-type",
    label: "Record type",
    type: "select",
    value: filters?.type || "all",
    options: [
      { value: "all", label: "All records" },
      { value: "event", label: "World events" },
      { value: "news", label: "News publications" },
    ],
  });
  const status = AdminField({
    name: "news-events-status",
    label: "Lifecycle",
    type: "select",
    value: filters?.status || "all",
    options: [
      { value: "all", label: "All lifecycle states" },
      { value: "active", label: "Active" },
      { value: "upcoming", label: "Upcoming" },
      { value: "past", label: "Past" },
      { value: "failed", label: "Failed" },
    ],
  });
  const scopes = scopeOptions(rows);
  const currentScope = scopes.some((option) => option.value === filters?.scope) ? filters.scope : "all";
  const scope = AdminField({
    name: "news-events-scope",
    label: "Scope / audience",
    type: "select",
    value: currentScope,
    options: scopes,
  });

  function selected() {
    return Object.freeze({
      query: search.getValue().trimStart().slice(0, 160),
      type: type.getValue(),
      status: status.getValue(),
      scope: scope.getValue(),
    });
  }

  function apply({ publish = true } = {}) {
    const next = selected();
    const query = next.query.trim().normalize("NFKC").toLocaleLowerCase();
    const visible = rows.filter((row) => {
      const searchable = [
        row.title,
        row.detail,
        row.eventKey,
        row.newsDefinitionId,
        row.fromPhase,
        row.toPhase,
        row.audience,
        row.lastErrorCode,
        row.actorType,
      ].map((value) => safeText(value, "", 1_000)).join(" ").normalize("NFKC").toLocaleLowerCase();
      return (!query || searchable.includes(query))
        && (next.type === "all" || row.type === next.type)
        && (next.status === "all" || row.status === next.status)
        && (next.scope === "all" || row.scope === next.scope);
    });
    table.setRows(visible);
    if (publish) onFiltersChange(next);
  }

  for (const field of [search, type, status, scope]) {
    field.control.addEventListener(field === search ? "input" : "change", apply);
  }
  apply({ publish: false });

  return createElement("section", {
    className: "admin-news-events__controls",
    attrs: { "aria-label": "News and event filters" },
    children: [search.element, type.element, status.element, scope.element],
  });
}

export function timeline(model, filters, onFiltersChange, onRecover) {
  const rows = combinedRows(model);
  const table = AdminDataTable({
    caption: "Authoritative world event and news publication timeline",
    rowKey: (row) => row.rowKey,
    columns: [
      { key: "type", label: "Type", render: typeBadge },
      {
        key: "title",
        label: "Record",
        rowHeader: true,
        render: (value, row) => createElement("div", {
          className: "admin-news-events__record",
          children: [
            createElement("strong", { text: safeText(value, "Record unavailable", 320) }),
            createElement("small", { text: safeText(row.detail, "No additional detail exposed", 600) }),
          ],
        }),
      },
      { key: "status", label: "Lifecycle", render: statusBadge },
      { key: "scope", label: "Scope / audience", render: (value) => titleCase(value) },
      { key: "timestamp", label: "Time", render: (value) => formatTime(value) },
      {
        key: "detailAction",
        label: "Detail",
        align: "end",
        render: (_value, row) => {
          const button = createElement("button", {
            className: "admin-button admin-button--quiet",
            attrs: { type: "button" },
            children: ["View details", AdminIcon({ name: "chevronRight", size: 16 })],
          });
          button.addEventListener("click", (event) => openDetail(row, onRecover, event.currentTarget));
          return button;
        },
      },
    ],
    emptyState: AdminEmptyState({
      title: "No records match",
      message: "Change the News & Events filters to view other authoritative records.",
      compact: true,
    }),
  });

  return createElement("section", {
    className: "admin-news-events__timeline",
    attrs: { "aria-labelledby": "admin-news-events-timeline" },
    children: [
      createElement("header", {
        className: "admin-news-events__section-head",
        children: [
          createElement("div", {
            children: [
              createElement("span", { text: "Campaign authority" }),
              createElement("h2", { attrs: { id: "admin-news-events-timeline" }, text: "Event & publication timeline" }),
            ],
          }),
          createElement("p", { text: `${number(rows.length)} records` }),
        ],
      }),
      controls({ rows, filters, onFiltersChange, table }),
      rows.length ? table.element : AdminEmptyState({
        title: "No authoritative news or events yet",
        message: "No executed campaign events or publish-news effects are available for the selected game.",
      }),
    ],
  });
}
