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
import { MarketInstrumentDetail } from "./MarketInstrumentDetail.js";
import { MarketSkeleton } from "./MarketSkeleton.js";

const UUID_IN_TEXT_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const PUBLIC_SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9.-]{0,15}$/;

function safeText(value, fallback = "", maximum = 500) {
  const text = String(value ?? "").trim();
  if (!text || UUID_IN_TEXT_PATTERN.test(text)) return fallback;
  return text.slice(0, maximum);
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function displayNumber(value, { sign = false, integer = false } = {}) {
  const number = finiteNumber(value);
  if (number === null) return "Not available";
  const absolute = Math.abs(number);
  const maximumFractionDigits = integer ? 0 : absolute > 0 && absolute < 1 ? 8 : 2;
  const formatted = number.toLocaleString("en-US", { maximumFractionDigits });
  return sign && number > 0 ? `+${formatted}` : formatted;
}

function titleCase(value, fallback = "Not available") {
  const text = safeText(value, "", 160);
  return text
    ? text.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
    : fallback;
}

function filterKey(value) {
  return safeText(value, "", 160)
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}._-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function publicRowKey(instrument, index) {
  const symbol = String(instrument?.symbol || instrument?.rowKey || "").trim().toUpperCase();
  return PUBLIC_SYMBOL_PATTERN.test(symbol) ? symbol : `market-instrument-${index + 1}`;
}

function marketButton({ label, icon, quiet = false, action, disabled = false, onClick }) {
  const button = createElement("button", {
    className: `admin-button${quiet ? " admin-button--quiet" : ""}`,
    attrs: { type: "button", disabled },
    dataset: { marketAction: action },
    children: [icon ? AdminIcon({ name: icon, size: 17 }) : null, label],
  });
  button.addEventListener("click", onClick);
  return button;
}

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

function summary(model) {
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

function sessionContractNotice() {
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

function priceCell(value) {
  return createElement("span", {
    className: "admin-market-route__price",
    children: [
      createElement("strong", { text: displayNumber(value) }),
      finiteNumber(value) !== null
        ? createElement("small", { text: "Currency not exposed" })
        : null,
    ],
  });
}

function movementCell(instrument) {
  const change = finiteNumber(instrument?.change);
  const percentage = finiteNumber(instrument?.changePct);
  if (change === null && percentage === null) {
    return createElement("span", {
      className: "admin-market-route__movement",
      dataset: { tone: "unknown" },
      text: "Daily movement unavailable",
    });
  }
  const comparison = percentage ?? change;
  const tone = comparison > 0 ? "positive" : comparison < 0 ? "negative" : "flat";
  const label = tone === "positive" ? "Up" : tone === "negative" ? "Down" : "Flat";
  const parts = [label];
  if (change !== null) parts.push(displayNumber(change, { sign: true }));
  if (percentage !== null) {
    const sign = percentage > 0 ? "+" : percentage < 0 ? "−" : "";
    parts.push(`(${sign}${displayNumber(Math.abs(percentage))}%)`);
  }
  return createElement("span", {
    className: "admin-market-route__movement",
    dataset: { tone },
    text: parts.join(" "),
  });
}

function listingCell(value) {
  const state = ["active", "inactive", "recent"].includes(String(value)) ? String(value) : "unknown";
  return createElement("span", {
    className: "admin-market-route__listing-state",
    dataset: { status: state },
    text: `${titleCase(state)} marker`,
  });
}

function instrumentCopy(instrument) {
  return createElement("div", {
    className: "admin-market-route__instrument-copy",
    children: [
      createElement("code", { text: safeText(instrument.symbol, "Symbol unavailable", 24) }),
      createElement("strong", { text: safeText(instrument.name, "Instrument name unavailable", 240) }),
      instrument.description
        ? createElement("small", { text: safeText(instrument.description, "", 320) })
        : null,
    ],
  });
}

function selectOptions(values, allLabel) {
  const seen = new Set();
  const options = [{ value: "all", label: allLabel }];
  for (const rawValue of values || []) {
    const label = safeText(rawValue, "", 160);
    const value = filterKey(label);
    if (!label || !value || seen.has(value)) continue;
    seen.add(value);
    options.push({ value, label });
  }
  return options;
}

function normalizedFilter(value, options) {
  const candidate = filterKey(value) || "all";
  return options.some((option) => option.value === candidate) ? candidate : "all";
}

function instrumentDirectory({ model, filters, onFiltersChange, onOpenDetail }) {
  const sectorOptions = selectOptions(model.sectors, "All sectors");
  const countryOptions = selectOptions(model.countries, "All countries");
  const typeOptions = [
    { value: "all", label: "All asset types" },
    { value: "stock", label: "Stock" },
    { value: "unknown", label: "Type unavailable" },
  ];
  const statusOptions = [
    { value: "all", label: "All listing markers" },
    { value: "active", label: "Active marker" },
    { value: "inactive", label: "Inactive marker" },
    { value: "recent", label: "Recent marker" },
    { value: "unknown", label: "Marker unavailable" },
  ];

  const search = AdminField({
    name: "market-search",
    label: "Search Market instruments",
    type: "search",
    placeholder: "Symbol, name, sector, type, or country",
    autocomplete: "off",
    value: safeText(filters?.query, "", 160),
    prefix: AdminIcon({ name: "search", size: 16 }),
  });
  const sector = AdminField({
    name: "market-sector",
    label: "Sector",
    type: "select",
    value: normalizedFilter(filters?.sector, sectorOptions),
    options: sectorOptions,
  });
  const type = AdminField({
    name: "market-type",
    label: "Asset type",
    type: "select",
    value: normalizedFilter(filters?.type, typeOptions),
    options: typeOptions,
  });
  const status = AdminField({
    name: "market-status",
    label: "Listing marker",
    type: "select",
    value: normalizedFilter(filters?.status, statusOptions),
    options: statusOptions,
  });
  const country = AdminField({
    name: "market-country",
    label: "Country",
    type: "select",
    value: normalizedFilter(filters?.country, countryOptions),
    options: countryOptions,
  });

  const controls = createElement("section", {
    className: "admin-market-route__controls",
    attrs: { "aria-label": "Market instrument filters" },
    children: [search.element, sector.element, type.element, status.element, country.element],
  });

  const table = AdminDataTable({
    caption: "Listed financial Market instruments",
    rowKey: publicRowKey,
    columns: [
      {
        key: "name",
        label: "Instrument",
        rowHeader: true,
        render: (_value, instrument) => instrumentCopy(instrument),
      },
      { key: "type", label: "Asset type", render: (value) => titleCase(value, "Type unavailable") },
      { key: "sector", label: "Sector", render: (value) => safeText(value, "Not available", 160) },
      { key: "countryCode", label: "Country", render: (value) => safeText(value, "Not available", 80) },
      { key: "currentPrice", label: "Current price", align: "end", render: priceCell },
      { key: "change", label: "Daily movement", align: "end", render: (_value, instrument) => movementCell(instrument) },
      { key: "status", label: "Listing marker", render: listingCell },
      {
        key: "detail",
        label: "Detail",
        align: "end",
        render: (_value, instrument) => marketButton({
          label: "View details",
          icon: "chevronRight",
          quiet: true,
          action: "detail",
          onClick(event) { onOpenDetail(instrument, event.currentTarget); },
        }),
      },
    ],
    emptyState: AdminEmptyState({
      title: "No instruments match",
      message: "Try changing the Market search or filters.",
      compact: true,
    }),
  });

  function selectedFilters() {
    return Object.freeze({
      query: search.getValue().trimStart().slice(0, 160),
      sector: sector.getValue(),
      type: type.getValue(),
      status: status.getValue(),
      country: country.getValue(),
    });
  }

  function applyFilters({ publish = true } = {}) {
    const selected = selectedFilters();
    const query = selected.query.trim().toLocaleLowerCase();
    const visible = model.instruments.filter((instrument) => {
      const searchable = [
        instrument.symbol,
        instrument.name,
        instrument.sector,
        instrument.type,
        instrument.countryCode,
      ]
        .map((value) => safeText(value, "", 240))
        .join(" ")
        .toLocaleLowerCase();
      return (!query || searchable.includes(query))
        && (selected.sector === "all" || filterKey(instrument.sector) === selected.sector)
        && (selected.type === "all" || filterKey(instrument.type || "unknown") === selected.type)
        && (selected.status === "all" || filterKey(instrument.status || "unknown") === selected.status)
        && (selected.country === "all" || filterKey(instrument.countryCode) === selected.country);
    });
    table.setRows(visible);
    if (publish) onFiltersChange(selected);
  }

  function updateFilters(nextFilters = {}) {
    search.setValue(safeText(nextFilters.query, "", 160));
    sector.setValue(normalizedFilter(nextFilters.sector, sectorOptions));
    type.setValue(normalizedFilter(nextFilters.type, typeOptions));
    status.setValue(normalizedFilter(nextFilters.status, statusOptions));
    country.setValue(normalizedFilter(nextFilters.country, countryOptions));
    applyFilters({ publish: false });
  }

  search.control.addEventListener("input", applyFilters);
  sector.control.addEventListener("change", applyFilters);
  type.control.addEventListener("change", applyFilters);
  status.control.addEventListener("change", applyFilters);
  country.control.addEventListener("change", applyFilters);
  applyFilters({ publish: false });

  const section = createElement("section", {
    className: "admin-market-route__catalog",
    attrs: { "aria-labelledby": "admin-market-instrument-directory" },
    children: [
      createElement("header", {
        className: "admin-market-route__section-head",
        children: [
          createElement("div", {
            children: [
              createElement("span", { text: "Authoritative directory" }),
              createElement("h2", { attrs: { id: "admin-market-instrument-directory" }, text: "Listed instruments" }),
            ],
          }),
          createElement("p", { text: `${displayNumber(model.instruments.length, { integer: true })} records` }),
        ],
      }),
      controls,
      model.isEmpty
        ? AdminEmptyState({
          title: "No financial instruments are listed",
          message: "The authoritative Market directory returned no instruments for the selected game.",
        })
        : table.element,
    ],
  });
  return Object.freeze({ element: section, updateFilters });
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

function recentTradesPanel(model, onRefresh) {
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

function marketEventsPanel(model, onRefresh) {
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

function resolvedMarket(model, options) {
  const directory = instrumentDirectory({ model, ...options });
  return Object.freeze({
    element: createElement("div", {
      className: "admin-market-route__resolved",
      children: [
        summary(model),
        sessionContractNotice(),
        directory.element,
        createElement("div", {
          className: "admin-market-route__activity-grid",
          children: [recentTradesPanel(model, options.onRefresh), marketEventsPanel(model, options.onRefresh)],
        }),
      ],
    }),
    updateFilters: directory.updateFilters,
  });
}

/** Composes the read-only financial Market route from the six-state contract. */
export function MarketRoute({
  state,
  filters = { query: "", sector: "all", type: "all", status: "all", country: "all" },
  detailState = {},
  selectedRowKey = "",
  onFiltersChange = () => {},
  onSelect = null,
  onRefresh = async () => {},
  loadDetail = null,
} = {}) {
  let destroyed = false;
  let directory = null;
  let drawer = null;
  let currentInstrument = null;
  let currentRowKey = "";
  let currentDetailState = detailState;
  let activeSelectedRowKey = safeText(selectedRowKey, "", 24);
  const requestDetail = typeof loadDetail === "function" ? loadDetail : onSelect;

  function detailFor(rowKey) {
    if (currentDetailState?.data?.rowKey === rowKey || activeSelectedRowKey === rowKey) {
      return currentDetailState;
    }
    return { status: ADMIN_DATA_STATES.INITIAL_LOADING, data: null, error: null };
  }

  function renderDrawerContent() {
    if (!drawer || !currentInstrument) return;
    drawer.setTitle(`${safeText(currentInstrument.symbol, "Instrument", 24)} instrument detail`);
    drawer.setDescription("Authoritative profile, price history, and supported financial signals.");
    drawer.setContent(MarketInstrumentDetail({
      instrument: currentInstrument,
      detailState: detailFor(currentRowKey),
      onRetry: typeof requestDetail === "function" ? () => requestDetail(currentRowKey) : null,
    }));
  }

  function ensureDrawer() {
    if (drawer) return drawer;
    drawer = AdminDrawer({
      title: "Instrument detail",
      description: "Authoritative Market instrument detail.",
      content: createElement("div"),
      size: "large",
      closeLabel: "Close instrument detail",
      onClose() {
        if (drawer) drawer.panel.dataset.open = "false";
      },
    });
    drawer.element.dataset.marketDrawer = "instrument-detail";
    drawer.panel.dataset.open = "false";
    return drawer;
  }

  function openDetail(instrument, opener) {
    if (destroyed) return;
    const rowKey = publicRowKey(instrument, 0);
    currentInstrument = instrument;
    currentRowKey = rowKey;
    activeSelectedRowKey = rowKey;
    currentDetailState = { status: ADMIN_DATA_STATES.INITIAL_LOADING, data: null, error: null };
    const activeDrawer = ensureDrawer();
    renderDrawerContent();
    activeDrawer.panel.dataset.open = "true";
    activeDrawer.open(opener);
    if (typeof requestDetail === "function") {
      try {
        void Promise.resolve(requestDetail(rowKey, opener)).catch(() => {});
      } catch (_error) {
        // Controller-owned error normalization publishes the safe failure state.
      }
    }
  }

  const refreshButton = marketButton({
    label: state.status === ADMIN_DATA_STATES.REFRESHING ? "Refreshing…" : "Refresh",
    icon: "refresh",
    quiet: true,
    action: "refresh",
    disabled: state.status === ADMIN_DATA_STATES.REFRESHING,
    onClick: onRefresh,
  });
  const route = createElement("div", {
    className: "admin-market-route",
    dataset: { adminV2State: state.status },
    attrs: {
      "aria-busy": [ADMIN_DATA_STATES.INITIAL_LOADING, ADMIN_DATA_STATES.REFRESHING].includes(state.status),
    },
  });

  if (state.status === ADMIN_DATA_STATES.INITIAL_LOADING) {
    route.append(MarketSkeleton());
  } else if (state.status === ADMIN_DATA_STATES.FAILED) {
    route.append(AdminErrorState({
      title: "Market Monitor could not be loaded",
      message: safeText(
        state.error?.userMessage,
        "Authoritative Market data is temporarily unavailable.",
        360,
      ),
      retryAfterSeconds: Number.isSafeInteger(state.error?.retryAfterSeconds)
        ? state.error.retryAfterSeconds
        : null,
      retry: state.error?.retryable ? { label: "Retry Market", onClick: onRefresh } : null,
    }));
  } else if (state.data) {
    directory = resolvedMarket(state.data, {
      filters,
      onFiltersChange,
      onOpenDetail: openDetail,
      onRefresh,
    });
    if (state.status === ADMIN_DATA_STATES.STALE) {
      route.append(AdminStaleState({
        message: safeText(
          state.error?.userMessage,
          "Showing the last authoritative Market data while the service recovers.",
          360,
        ),
        retry: { label: "Retry", onClick: onRefresh },
        content: directory.element,
      }));
    } else {
      if (state.status === ADMIN_DATA_STATES.REFRESHING) {
        route.append(createElement("div", {
          className: "admin-market-route__refresh-state",
          attrs: { role: "status" },
          children: [AdminIcon({ name: "refresh", size: 17 }), "Refreshing authoritative Market data…"],
        }));
      }
      route.append(directory.element);
    }
  }

  const pageFrame = AdminPageFrame({
    eyebrow: "Game administration",
    title: "Market Monitor",
    description: "Monitor listed instruments, price movement, aggregate activity, and market events. This route is read-only until a supported market-control mutation exists.",
    actions: refreshButton,
    content: route,
  });

  return {
    ...pageFrame,
    updateFilters(nextFilters) {
      directory?.updateFilters(nextFilters);
    },
    updateDetail(nextDetailState, nextSelectedRowKey = "") {
      if (destroyed) return;
      currentDetailState = nextDetailState || {};
      const nextRowKey = safeText(nextSelectedRowKey, "", 24);
      if (nextRowKey) activeSelectedRowKey = nextRowKey;
      if (!drawer?.isOpen() || (nextRowKey && nextRowKey !== currentRowKey)) return;
      const nextProfile = nextDetailState?.data?.profile;
      if (nextProfile?.rowKey === currentRowKey) currentInstrument = nextProfile;
      renderDrawerContent();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      drawer?.destroy();
      drawer = null;
      currentInstrument = null;
      currentRowKey = "";
    },
  };
}
