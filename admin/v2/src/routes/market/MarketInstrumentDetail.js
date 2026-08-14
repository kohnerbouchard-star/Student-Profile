import {
  AdminEmptyState,
  AdminErrorState,
  AdminSkeleton,
  AdminStaleState,
} from "../../components/index.js";
import { createElement } from "../../components/dom.js";
import { ADMIN_DATA_STATES } from "../../core/data-state.js";
import { MarketChart } from "./MarketChart.js";

const UUID_IN_TEXT_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const LISTING_STATES = new Set(["active", "inactive", "recent", "unknown"]);

const FUNDAMENTALS = Object.freeze([
  Object.freeze({ key: "revenueGrowth", label: "Revenue growth" }),
  Object.freeze({ key: "profitMargin", label: "Profit margin" }),
  Object.freeze({ key: "debtLevel", label: "Debt level" }),
  Object.freeze({ key: "cashReserves", label: "Cash reserves" }),
  Object.freeze({ key: "innovationScore", label: "Innovation score" }),
  Object.freeze({ key: "supplyChainRisk", label: "Supply-chain risk" }),
  Object.freeze({ key: "politicalExposure", label: "Political exposure" }),
  Object.freeze({ key: "commodityExposure", label: "Commodity exposure" }),
]);

function safeText(value, fallback = "Not available", maximum = 500) {
  const text = String(value ?? "").trim();
  if (!text || UUID_IN_TEXT_PATTERN.test(text)) return fallback;
  return text.slice(0, maximum);
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatNumber(value, { sign = false } = {}) {
  const number = finiteNumber(value);
  if (number === null) return "Not available";
  const absolute = Math.abs(number);
  const maximumFractionDigits = absolute > 0 && absolute < 1 ? 8 : 2;
  const formatted = number.toLocaleString("en-US", { maximumFractionDigits });
  return sign && number > 0 ? `+${formatted}` : formatted;
}

function formatPercent(value) {
  const number = finiteNumber(value);
  if (number === null) return "Percentage unavailable";
  const formatted = Math.abs(number).toLocaleString("en-US", { maximumFractionDigits: 2 });
  return `${number > 0 ? "+" : number < 0 ? "−" : ""}${formatted}%`;
}

function titleCase(value, fallback = "Not available") {
  const text = safeText(value, "", 80);
  return text
    ? text.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
    : fallback;
}

function listingState(value) {
  const state = String(value || "").trim().toLowerCase();
  return LISTING_STATES.has(state) ? state : "unknown";
}

function movement(instrument) {
  const change = finiteNumber(instrument?.change);
  const percentage = finiteNumber(instrument?.changePct);
  if (change === null && percentage === null) {
    return Object.freeze({ tone: "unknown", label: "Daily movement unavailable" });
  }
  const direction = (percentage ?? change) > 0 ? "up" : (percentage ?? change) < 0 ? "down" : "flat";
  const directionLabel = direction === "up" ? "Up" : direction === "down" ? "Down" : "Flat";
  const parts = [directionLabel];
  if (change !== null) parts.push(formatNumber(change, { sign: true }));
  if (percentage !== null) parts.push(`(${formatPercent(percentage)})`);
  return Object.freeze({ tone: direction, label: parts.join(" ") });
}

function metric(label, value, detail = "") {
  return createElement("div", {
    className: "admin-market-detail__metric",
    children: [
      createElement("dt", { text: label }),
      createElement("dd", { text: value }),
      detail ? createElement("small", { text: detail }) : null,
    ],
  });
}

function instrumentIdentity(instrument) {
  const symbol = safeText(instrument?.symbol, "Symbol unavailable", 24);
  const name = safeText(instrument?.name, "Instrument name unavailable", 240);
  const status = listingState(instrument?.status);
  return createElement("header", {
    className: "admin-market-detail__identity",
    children: [
      createElement("div", {
        className: "admin-market-detail__identity-copy",
        children: [
          createElement("code", { className: "admin-market-detail__symbol", text: symbol }),
          createElement("h3", { text: name }),
          createElement("p", {
            text: [
              titleCase(instrument?.type, "Type unavailable"),
              safeText(instrument?.sector, "Sector unavailable", 160),
              safeText(instrument?.countryCode, "Country unavailable", 80),
            ].join(" · "),
          }),
        ],
      }),
      createElement("span", {
        className: "admin-market-detail__listing-state",
        dataset: { status },
        text: `${titleCase(status)} listing marker`,
      }),
    ],
  });
}

function priceMetrics(instrument) {
  const dailyMovement = movement(instrument);
  return createElement("dl", {
    className: "admin-market-detail__metrics",
    attrs: { "aria-label": "Instrument price and market metrics" },
    children: [
      metric("Current price", formatNumber(instrument?.currentPrice), "Currency not exposed"),
      metric("Daily movement", dailyMovement.label),
      metric("Previous close", formatNumber(instrument?.previousClose), "Currency not exposed"),
      metric("Open", formatNumber(instrument?.open), "Currency not exposed"),
      metric("Day high", formatNumber(instrument?.high), "Currency not exposed"),
      metric("Day low", formatNumber(instrument?.low), "Currency not exposed"),
      metric("Market cap", formatNumber(instrument?.marketCap), "Currency not exposed"),
      metric("Beta", formatNumber(instrument?.beta)),
      metric("Volatility", formatNumber(instrument?.volatility)),
    ],
  });
}

function errorState(error, { title, retryLabel, onRetry }) {
  const retry = error?.retryable && typeof onRetry === "function"
    ? { label: retryLabel, onClick: onRetry }
    : null;
  return AdminErrorState({
    title,
    message: safeText(
      error?.userMessage,
      "Authoritative Market data is temporarily unavailable.",
      360,
    ),
    retryAfterSeconds: Number.isSafeInteger(error?.retryAfterSeconds)
      ? error.retryAfterSeconds
      : null,
    retry,
    compact: true,
  });
}

function panelFailure(panel, title, onRetry) {
  if (panel?.status !== "failed") return null;
  return errorState(panel.error, {
    title,
    retryLabel: "Retry instrument detail",
    onRetry,
  });
}

function fundamentalsPanel(values = {}, panel, onRetry) {
  const hasValue = FUNDAMENTALS.some(({ key }) => finiteNumber(values?.[key]) !== null);
  return createElement("section", {
    className: "admin-market-detail__section",
    attrs: { "aria-labelledby": "admin-market-detail-fundamentals" },
    children: [
      createElement("h3", {
        attrs: { id: "admin-market-detail-fundamentals" },
        text: "Financial and exposure signals",
      }),
      panelFailure(panel, "Financial signals are unavailable", onRetry),
      hasValue
        ? createElement("dl", {
          className: "admin-market-detail__fundamentals",
          children: FUNDAMENTALS.map(({ key, label }) => metric(label, formatNumber(values?.[key]))),
        })
        : AdminEmptyState({
          title: "Optional financial signals unavailable",
          message: "The current authoritative response did not provide fundamentals or exposure values.",
          compact: true,
        }),
    ],
  });
}

function chartPanel(history, panel, instrument, onRetry) {
  return createElement("section", {
    className: "admin-market-detail__section admin-market-detail__chart-section",
    attrs: { "aria-label": "Instrument price history" },
    children: [
      panelFailure(panel, "Price history could not be loaded", onRetry)
        || MarketChart({ history, instrument }),
    ],
  });
}

function resolvedContent(data, fallbackInstrument, onRetry) {
  const instrument = data?.profile || fallbackInstrument || {};
  const panels = data?.panels || {};
  const history = Array.isArray(data?.chart) && data.chart.length
    ? data.chart
    : instrument.history;
  const description = safeText(instrument.description, "", 2_000);
  return createElement("div", {
    className: "admin-market-detail__resolved",
    children: [
      instrumentIdentity(instrument),
      panelFailure(panels.profile, "Instrument profile is partially unavailable", onRetry),
      createElement("p", {
        className: "admin-market-detail__contract-note",
        text: "Asset currency and exchange-session state are not included in this Admin view, so values are shown without an assumed currency or open/closed label.",
      }),
      priceMetrics(instrument),
      description
        ? createElement("section", {
          className: "admin-market-detail__section",
          children: [
            createElement("h3", { text: "Instrument profile" }),
            createElement("p", { className: "admin-market-detail__description", text: description }),
          ],
        })
        : null,
      chartPanel(history, panels.chart, instrument, onRetry),
      fundamentalsPanel(data?.fundamentals || instrument.fundamentals, panels.financials, onRetry),
    ],
  });
}

function loadingContent(instrument) {
  return createElement("div", {
    className: "admin-market-detail__loading",
    attrs: { "aria-label": "Loading instrument detail" },
    children: [
      instrumentIdentity(instrument),
      priceMetrics(instrument),
      createElement("div", {
        className: "admin-market-detail__loading-grid",
        children: AdminSkeleton({ label: "Loading instrument metrics", count: 6 }),
      }),
      createElement("div", {
        className: "admin-market-detail__loading-chart",
        children: AdminSkeleton({ label: "Loading instrument price history", count: 4, shape: "row" }),
      }),
    ],
  });
}

/** Presents one public Market instrument without admitting resource identifiers. */
export function MarketInstrumentDetail({
  instrument = {},
  detailState = {},
  onRetry = null,
} = {}) {
  const status = detailState.status || ADMIN_DATA_STATES.INITIAL_LOADING;
  const root = createElement("div", {
    className: "admin-market-detail",
    dataset: { marketDetailState: status },
    attrs: {
      "aria-busy": [ADMIN_DATA_STATES.INITIAL_LOADING, ADMIN_DATA_STATES.REFRESHING].includes(status),
    },
  });

  if (status === ADMIN_DATA_STATES.INITIAL_LOADING) {
    root.append(loadingContent(instrument));
    return root;
  }

  if (status === ADMIN_DATA_STATES.FAILED && !detailState.data) {
    root.append(
      instrumentIdentity(instrument),
      errorState(detailState.error, {
        title: "Instrument detail could not be loaded",
        retryLabel: "Retry instrument detail",
        onRetry,
      }),
    );
    return root;
  }

  const content = resolvedContent(detailState.data, instrument, onRetry);
  if (status === ADMIN_DATA_STATES.STALE) {
    root.append(AdminStaleState({
      message: safeText(
        detailState.error?.userMessage,
        "Showing the last authoritative instrument detail while the service recovers.",
        360,
      ),
      retry: typeof onRetry === "function" ? { label: "Retry", onClick: onRetry } : null,
      content,
    }));
  } else {
    root.append(content);
  }
  return root;
}
