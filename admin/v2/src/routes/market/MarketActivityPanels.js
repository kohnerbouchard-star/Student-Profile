import { AdminEmptyState, AdminErrorState, AdminIcon } from "../../components/index.js";
import { createElement } from "../../components/dom.js";
import { displayNumber, finiteNumber, safeText, titleCase } from "./MarketViewHelpers.js";

function summaryMetric(key, label, value, detail) {
  return createElement("article", {
    className: "admin-market-route__metric",
    dataset: { marketSummary: key },
    children: [
      createElement("span", { text: label }),
      createElement("output", { text: displayNumber(value, { integer: true }) }),
      createElement("small", { text: detail }),
    ],
  });
}

export function summary(model) {
  const values = model?.summary || {};
  return createElement("section", {
    className: "admin-market-route__summary",
    attrs: { "aria-label": "Market summary" },
    children: [
      summaryMetric("instruments", "Listed instruments", values.listedCount, "Authoritative directory"),
      summaryMetric("sectors", "Sectors", values.sectorCount, "Listed sector labels"),
      summaryMetric("trades", "Recent trade records", values.recentTradeCount, "Aggregate activity feed"),
      summaryMetric("events", "Active event markers", values.markedActiveEventCount, "Marked active by the API"),
    ],
  });
}

export function sessionContractNotice() {
  return createElement("aside", {
    className: "admin-market-route__session-note",
    attrs: { role: "note", "aria-label": "Market session contract" },
    children: [
      AdminIcon({ name: "info", size: 18 }),
      createElement("p", {
        children: [
          createElement("strong", { text: "Some exchange context is not available in Admin" }),
          createElement("span", {
            text: "Session open/closed state, composite index, total volume, and asset currency are not included in this view. Values are shown only when the game provides them.",
          }),
        ],
      }),
    ],
  });
}

function panelError(panel, title, onRefresh) {
  if (panel?.status !== "failed") return null;
  return AdminErrorState({
    title,
    message: safeText(
      panel.error?.userMessage,
      "This authoritative Market feed is temporarily unavailable.",
      360,
    ),
    retryAfterSeconds: Number.isSafeInteger(panel.error?.retryAfterSeconds)
      ? panel.error.retryAfterSeconds
      : null,
    retry: panel.error?.retryable ? { label: "Retry Market", onClick: onRefresh } : null,
    compact: true,
  });
}

export function recentTradesPanel(model, onRefresh) {
  const error = panelError(model.panels?.trades, "Recent trade activity is unavailable", onRefresh);
  const content = error || (model.trades.length
    ? createElement("ol", {
      className: "admin-market-route__activity-list",
      children: model.trades.slice(0, 8).map((trade) => createElement("li", {
        children: [
          createElement("div", {
            children: [
              createElement("code", { text: safeText(trade.symbol, "Symbol unavailable", 24) }),
              createElement("strong", { text: safeText(trade.assetName, "Instrument name unavailable", 240) }),
            ],
          }),
          createElement("span", {
            className: "admin-market-route__trade-side",
            dataset: { side: ["buy", "sell"].includes(trade.side) ? trade.side : "unknown" },
            text: titleCase(trade.side, "Side unavailable"),
          }),
          createElement("p", {
            text: `${displayNumber(trade.quantity)} units · ${displayNumber(trade.executionPrice)} execution price · currency not exposed`,
          }),
        ],
      })),
    })
    : AdminEmptyState({
      title: "No recent trade records",
      message: "The current aggregate Market activity feed is empty.",
      compact: true,
    }));
  return activityPanel("Recent activity", "Aggregate trade records", content);
}

export function marketEventsPanel(model, onRefresh) {
  const error = panelError(model.panels?.events, "Market events are unavailable", onRefresh);
  const content = error || (model.events.length
    ? createElement("ol", {
      className: "admin-market-route__event-list",
      children: model.events.slice(0, 8).map((event) => createElement("li", {
        children: [
          createElement("div", {
            className: "admin-market-route__event-head",
            children: [
              createElement("strong", { text: safeText(event.headline, "Market event", 320) }),
              createElement("span", {
                className: "admin-market-route__event-state",
                dataset: { status: event.active ? "active" : "inactive" },
                text: event.active ? "Active marker" : `${titleCase(event.status, "Unknown")} marker`,
              }),
            ],
          }),
          event.explanation
            ? createElement("p", { text: safeText(event.explanation, "", 500) })
            : null,
          createElement("small", {
            text: [
              event.category,
              event.sentiment,
              event.source,
              finiteNumber(event.magnitude) !== null
                ? "Magnitude " + displayNumber(event.magnitude)
                : "",
              finiteNumber(event.volatilityImpact) !== null
                ? "Volatility impact " + displayNumber(event.volatilityImpact)
                : "",
            ]
              .map((value) => safeText(value, "", 80))
              .filter(Boolean)
              .join(" · ") || "Event metadata unavailable",
          }),
        ],
      })),
    })
    : AdminEmptyState({
      title: "No Market event records",
      message: "No active or recent event records were returned by the current read-only feed.",
      compact: true,
    }));
  return activityPanel("Market intelligence", "Event and exposure records", content);
}

function activityPanel(eyebrow, title, content) {
  return createElement("section", {
    className: "admin-market-route__activity-panel",
    children: [
      createElement("header", {
        children: [
          createElement("span", { text: eyebrow }),
          createElement("h2", { text: title }),
        ],
      }),
      content,
    ],
  });
}
