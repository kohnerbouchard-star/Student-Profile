import { AdminEmptyState, AdminErrorState, AdminIcon } from "../../components/index.js";
import { createElement } from "../../components/dom.js";
import { formatTime, number, statusBadge, titleCase } from "./NewsEventsViewHelpers.js";
import { timeline } from "./NewsEventsTimeline.js";

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

export function resolvedContent(model, filters, onFiltersChange, onRefresh, onRecover) {
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
