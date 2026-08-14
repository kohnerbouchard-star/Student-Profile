import {
  AdminDataTable,
  AdminDrawer,
  AdminEmptyState,
  AdminErrorState,
  AdminField,
  AdminIcon,
  AdminPageFrame,
  AdminStaleState,
} from "../../components/index.js";
import { createElement } from "../../components/dom.js";
import { ADMIN_DATA_STATES } from "../../core/data-state.js";

const UUID_IN_TEXT_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

function safeText(value, fallback = "", maximum = 1_000) {
  const result = String(value ?? "").trim();
  if (!result || UUID_IN_TEXT_PATTERN.test(result)) return fallback;
  return result.slice(0, maximum);
}

function titleCase(value, fallback = "Not available") {
  const text = safeText(value, "", 160);
  return text
    ? text.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
    : fallback;
}

function formatTime(value, fallback = "Not available") {
  const timestamp = Date.parse(String(value || ""));
  if (!Number.isFinite(timestamp)) return fallback;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function number(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString() : "0";
}

function metric(key, label, value, detail) {
  return createElement("article", {
    className: "admin-news-events__metric",
    dataset: { newsEventsMetric: key },
    children: [
      createElement("span", { text: label }),
      createElement("output", { text: number(value) }),
      createElement("small", { text: detail }),
    ],
  });
}

function summary(model) {
  const values = model?.summary || {};
  return createElement("section", {
    className: "admin-news-events__summary",
    attrs: { "aria-label": "News and events summary" },
    children: [
      metric("events", "World events", values.eventCount, "Executed campaign events"),
      metric("news", "News publications", values.newsPublicationCount, "Campaign publish-news effects"),
      metric("active", "Publishing now", values.activeCount, "Effects being processed"),
      metric("upcoming", "Upcoming", values.upcomingCount, "Pending publications or scheduled checkpoints"),
      metric("failed", "Needs attention", values.failedCount, "Failed news publication effects"),
    ],
  });
}

function contractNotice() {
  return createElement("aside", {
    className: "admin-news-events__contract-note",
    attrs: { role: "note", "aria-label": "News and events contract boundary" },
    children: [
      AdminIcon({ name: "info", size: 18 }),
      createElement("div", {
        children: [
          createElement("strong", { text: "Read-only publication monitor" }),
          createElement("p", {
            text: "This page monitors campaign events, publication status, upcoming checkpoints, and failed-publication recovery. News authoring and arbitrary event scheduling are not available from this surface.",
          }),
        ],
      }),
    ],
  });
}

function statusBadge(value) {
  const status = ["active", "upcoming", "past", "failed", "paused"].includes(String(value))
    ? String(value)
    : "unknown";
  return createElement("span", {
    className: "admin-news-events__status",
    dataset: { status },
    text: titleCase(status),
  });
}

function typeBadge(value) {
  const kind = value === "news" ? "news" : "event";
  return createElement("span", {
    className: "admin-news-events__type",
    dataset: { type: kind },
    text: kind === "news" ? "News publication" : "World event",
  });
}

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

function detailPair(label, value) {
  return createElement("div", {
    children: [
      createElement("dt", { text: label }),
      createElement("dd", { text: safeText(value, "Not available", 1_000) }),
    ],
  });
}

function openDetail(row, onRecover, trigger) {
  const isNews = row.type === "news";
  const pairs = isNews
    ? [
      detailPair("Definition", row.newsDefinitionId),
      detailPair("Published content", "The current read model does not expose the rendered headline/body."),
      detailPair("Audience", titleCase(row.audience)),
      detailPair("Publication status", titleCase(row.status)),
      detailPair("Attempts", String(row.attemptCount ?? 0)),
      detailPair("Last delivery error", row.lastErrorCode ? titleCase(row.lastErrorCode) : "None reported"),
      detailPair("Created", formatTime(row.createdAt)),
      detailPair("Claimed", formatTime(row.claimedAt)),
      detailPair("Completed", formatTime(row.completedAt)),
    ]
    : [
      detailPair("Event key", row.eventKey),
      detailPair("Transition", `${titleCase(row.fromPhase)} → ${titleCase(row.toPhase)}`),
      detailPair("Sequence", row.sequence == null ? "Not available" : String(row.sequence)),
      detailPair("Actor", titleCase(row.actorType)),
      detailPair("Trigger", row.triggerKey || "Not exposed"),
      detailPair("Reason", row.reason || "No reason exposed"),
      detailPair("Occurred", formatTime(row.occurredAt)),
    ];

  const content = createElement("div", {
    className: "admin-news-events__detail",
    children: [
      createElement("div", {
        className: "admin-news-events__detail-badges",
        children: [typeBadge(row.type), statusBadge(row.status)],
      }),
      createElement("dl", { className: "admin-news-events__detail-grid", children: pairs }),
    ],
  });

  if (isNews && row.status === "failed") {
    const reason = AdminField({
      name: `news-recovery-reason-${row.rowKey}`,
      label: "Recovery reason",
      type: "textarea",
      required: true,
      hint: "Required by the authoritative recovery contract. Use 12–1,000 characters.",
      placeholder: "Explain why this failed publication should be retried.",
      autocomplete: "off",
    });
    reason.control.maxLength = 1_000;
    reason.control.minLength = 12;
    reason.control.rows = 5;
    const recover = createElement("button", {
      className: "admin-button",
      attrs: { type: "button" },
      text: "Recover failed publication",
    });
    recover.addEventListener("click", async () => {
      const value = reason.getValue().trim();
      if (value.length < 12) {
        reason.setError("Enter at least 12 characters explaining the recovery.");
        reason.focus();
        return;
      }
      reason.setError("");
      recover.disabled = true;
      const succeeded = await onRecover(row.rowKey, value);
      if (!succeeded) recover.disabled = false;
      else drawer.close();
    });
    content.append(createElement("section", {
      className: "admin-news-events__recovery",
      attrs: { "aria-label": "Failed news publication recovery" },
      children: [
        createElement("h3", { text: "Supported recovery action" }),
        createElement("p", { text: "This retries the existing failed campaign effect. It does not create or edit a news item." }),
        reason.element,
        recover,
      ],
    }));
  }

  const drawer = AdminDrawer({
    title: isNews ? "News publication detail" : "World event detail",
    description: safeText(row.title, isNews ? "News publication" : "World event", 320),
    content,
  });
  drawer.element.addEventListener("admin-dialog-close", () => drawer.destroy(), { once: true });
  drawer.open(trigger);
}

function timeline(model, filters, onFiltersChange, onRecover) {
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

function scheduledPanel(model) {
  const scheduled = (model?.campaigns || []).filter((campaign) => campaign.temporalStatus === "upcoming");
  if (!scheduled.length) {
    return AdminEmptyState({
      title: "No upcoming campaign checkpoint exposed",
      message: "The current campaign contract does not report a future scheduled checkpoint for this game.",
      compact: true,
    });
  }
  return createElement("ol", {
    className: "admin-news-events__schedule-list",
    children: scheduled.map((campaign) => createElement("li", {
      children: [
        createElement("div", {
          children: [
            createElement("strong", { text: `${titleCase(campaign.phase)} phase` }),
            statusBadge("upcoming"),
          ],
        }),
        createElement("p", { text: `Next campaign checkpoint: ${formatTime(campaign.scheduledAt)}` }),
        createElement("small", {
          text: campaign.eventSequence == null
            ? "Event sequence not exposed"
            : `Current event sequence ${campaign.eventSequence.toLocaleString()}`,
        }),
      ],
    })),
  });
}

function panelError(panel, title, onRefresh) {
  if (panel?.status !== "failed") return null;
  return AdminErrorState({
    title,
    message: panel.error?.userMessage || "This authoritative News & Events feed is unavailable.",
    requestId: panel.error?.requestId,
    retryAfterSeconds: panel.error?.retryAfterSeconds,
    retry: panel.error?.retryable ? { label: "Retry", onClick: onRefresh } : null,
    compact: true,
  });
}

function partialFeedWarnings(model, onRefresh) {
  const warnings = [
    panelError(model.panels?.history, "World event history is unavailable", onRefresh),
    panelError(model.panels?.effects, "News publication status is unavailable", onRefresh),
    panelError(model.panels?.campaign, "Campaign schedule status is unavailable", onRefresh),
  ].filter(Boolean);
  return warnings.length
    ? createElement("section", { className: "admin-news-events__warnings", children: warnings })
    : null;
}

function resolvedContent(model, filters, onFiltersChange, onRefresh, onRecover) {
  return createElement("div", {
    className: "admin-news-events__resolved",
    children: [
      summary(model),
      contractNotice(),
      partialFeedWarnings(model, onRefresh),
      createElement("section", {
        className: "admin-news-events__schedule",
        attrs: { "aria-labelledby": "admin-news-events-schedule" },
        children: [
          createElement("header", {
            className: "admin-news-events__section-head",
            children: [
              createElement("div", {
                children: [
                  createElement("span", { text: "Timing" }),
                  createElement("h2", { attrs: { id: "admin-news-events-schedule" }, text: "Upcoming checkpoint" }),
                ],
              }),
            ],
          }),
          scheduledPanel(model),
        ],
      }),
      timeline(model, filters, onFiltersChange, onRecover),
    ],
  });
}

function loadingContent() {
  return createElement("div", {
    className: "admin-news-events__loading",
    attrs: { "aria-label": "Loading News & Events" },
    children: [
      createElement("div", { className: "admin-news-events__loading-summary", children: Array.from({ length: 5 }, () => createElement("span", { className: "admin-skeleton-block" })) }),
      createElement("div", { className: "admin-news-events__loading-panel admin-skeleton-block" }),
      createElement("div", { className: "admin-news-events__loading-table admin-skeleton-block" }),
    ],
  });
}

function refreshButton(onRefresh, disabled = false) {
  const button = createElement("button", {
    className: "admin-button admin-button--quiet",
    attrs: { type: "button", disabled },
    children: [AdminIcon({ name: "refresh", size: 16 }), disabled ? "Refreshing…" : "Refresh"],
  });
  button.addEventListener("click", () => onRefresh());
  return button;
}

export function NewsEventsRoute({
  state,
  filters,
  onFiltersChange = () => {},
  onRefresh = () => {},
  onRecover = () => Promise.resolve(false),
} = {}) {
  const status = state?.status || ADMIN_DATA_STATES.INITIAL_LOADING;
  let content;
  if (status === ADMIN_DATA_STATES.INITIAL_LOADING) {
    content = loadingContent();
  } else if (status === ADMIN_DATA_STATES.FAILED) {
    content = AdminErrorState({
      title: "News & Event Monitor could not be loaded",
      message: state.error?.userMessage || "The authoritative world-event service is unavailable.",
      requestId: state.error?.requestId,
      retryAfterSeconds: state.error?.retryAfterSeconds,
      retry: state.error?.retryable ? { label: "Retry monitor", onClick: onRefresh } : null,
    });
  } else {
    const resolved = resolvedContent(state.data || {}, filters, onFiltersChange, onRefresh, onRecover);
    content = status === ADMIN_DATA_STATES.STALE
      ? AdminStaleState({
        message: "Showing the most recently resolved News & Events data while the authoritative feeds reconnect.",
        retry: { label: "Refresh", onClick: onRefresh },
        content: resolved,
      })
      : resolved;
  }

  const frame = AdminPageFrame({
    eyebrow: "World",
    title: "News & Event Monitor",
    description: "Read campaign events and publication status, inspect upcoming checkpoints, and recover failed publication effects. Content authoring remains outside this read-only monitor.",
    actions: refreshButton(onRefresh, status === ADMIN_DATA_STATES.REFRESHING),
    content,
  });
  frame.element.classList.add("admin-news-events");
  frame.element.dataset.newsEventsState = status;
  return Object.freeze({ element: frame.element });
}
