import {
  ADMIN_DATA_STATES,
  beginAdminDataLoad,
  createAdminDataState,
  rejectAdminDataLoad,
  resolveAdminDataLoad,
} from "../../core/data-state.js";
import {
  createAdminErrorEnvelope,
  isAdminErrorEnvelope,
  normalizeAdminError,
} from "../../core/error-envelope.js";
import { MarketRoute } from "./MarketRoute.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_IN_TEXT_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const TICKER_PATTERN = /^[A-Z0-9][A-Z0-9.-]{0,15}$/;
const FUNDAMENTAL_KEYS = Object.freeze([
  "revenueGrowth",
  "profitMargin",
  "debtLevel",
  "cashReserves",
  "innovationScore",
  "supplyChainRisk",
  "politicalExposure",
  "commodityExposure",
]);

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function safeText(value, maximum = 500) {
  if (!["string", "number", "boolean"].includes(typeof value)) return "";
  const text = String(value ?? "").trim();
  if (!text || UUID_IN_TEXT_PATTERN.test(text)) return "";
  return text.slice(0, maximum);
}

function safeFinite(value) {
  if (value === null || value === undefined || value === "") return null;
  if (!["string", "number"].includes(typeof value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function safeNonNegative(value) {
  const number = safeFinite(value);
  return number !== null && number >= 0 ? number : null;
}

function safeInteger(value) {
  const number = safeFinite(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function safeTicker(value) {
  if (!["string", "number"].includes(typeof value)) return "";
  const ticker = String(value ?? "").trim().toUpperCase();
  return TICKER_PATTERN.test(ticker) ? ticker : "";
}

function safeResourceId(row) {
  for (const candidate of [row?.id, row?.assetId]) {
    if (typeof candidate !== "string") continue;
    const value = candidate.trim().toLowerCase();
    if (UUID_PATTERN.test(value)) return value;
  }
  return null;
}

function safeFilterText(value, fallback = "all") {
  const text = safeText(value, 160).toLowerCase();
  return text || fallback;
}

function panel(result, key) {
  const candidate = result?.panels?.[key];
  return isRecord(candidate) ? candidate : null;
}

function panelData(result, key) {
  const candidate = panel(result, key);
  return candidate?.status === "fulfilled" ? candidate.value?.data : null;
}

function panelRows(result, key, aliases) {
  const data = panelData(result, key);
  if (!isRecord(data)) return null;
  for (const alias of aliases) {
    if (Array.isArray(data[alias])) return data[alias];
  }
  return null;
}

function safeError(error) {
  return isAdminErrorEnvelope(error) ? error : normalizeAdminError(error);
}

function panelStatus(result, key) {
  const candidate = panel(result, key);
  return Object.freeze({
    status: candidate?.status === "fulfilled" ? "ready" : "failed",
    error: candidate?.status === "rejected"
      ? safeError(candidate.reason)
      : candidate?.status === "fulfilled"
      ? null
      : createAdminErrorEnvelope({ code: "INVALID_RESPONSE", retryable: true }),
  });
}

function normalizeFundamentals(value) {
  const source = isRecord(value) ? value : {};
  return Object.freeze(Object.fromEntries(
    FUNDAMENTAL_KEYS.map((key) => [key, safeFinite(source[key])]),
  ));
}

function normalizeCachedHistory(value) {
  if (!Array.isArray(value)) return Object.freeze([]);
  return Object.freeze(value.slice(-500).map((row) => {
    if (!isRecord(row)) return null;
    const price = safeNonNegative(row.price ?? row.close);
    if (price === null) return null;
    return Object.freeze({
      tickIndex: safeInteger(row.tickIndex),
      timestamp: safeText(row.timestamp || row.time, 80),
      label: safeText(row.label, 80),
      price,
      volume: safeNonNegative(row.volume),
    });
  }).filter(Boolean));
}

function normalizedStatus(row) {
  if (row?.isActive === true || row?.active === true) return "active";
  if (row?.isActive === false || row?.active === false) return "inactive";
  const status = safeText(row?.status, 40).toLowerCase();
  return ["active", "inactive", "recent"].includes(status) ? status : "unknown";
}

function normalizeInstrument(row) {
  if (!isRecord(row)) return null;
  const symbol = safeTicker(row.ticker || row.symbol);
  if (!symbol) return null;
  const rawType = safeText(row.assetType || row.type, 40).toLowerCase();
  return Object.freeze({
    rowKey: symbol,
    symbol,
    name: safeText(row.companyName || row.name, 240) || symbol,
    type: rawType === "stock" ? "stock" : "unknown",
    sector: safeText(row.sector, 160),
    countryCode: safeText(row.countryCode, 80).toUpperCase(),
    description: safeText(row.description, 2_000),
    currentPrice: safeNonNegative(row.currentPrice ?? row.price),
    previousClose: safeNonNegative(row.previousClose),
    open: safeNonNegative(row.open ?? row.openPrice),
    high: safeNonNegative(row.high ?? row.dayHigh),
    low: safeNonNegative(row.low ?? row.dayLow),
    change: safeFinite(row.change),
    changePct: safeFinite(row.changePct),
    marketCap: safeNonNegative(row.marketCap),
    beta: safeNonNegative(row.beta),
    volatility: safeNonNegative(row.volatility ?? row.currentVolatility),
    status: normalizedStatus(row),
    fundamentals: normalizeFundamentals(row.fundamentals || row.financials),
    history: normalizeCachedHistory(row.chartHistory || row.history),
    createdAt: safeText(row.createdAt, 80),
    updatedAt: safeText(row.updatedAt, 80),
  });
}

function normalizeTrade(row, index) {
  if (!isRecord(row)) return null;
  const symbol = safeTicker(row.ticker || row.symbol);
  if (!symbol) return null;
  const side = safeText(row.side, 20).toLowerCase();
  return Object.freeze({
    rowKey: `${symbol}-trade-${index + 1}`,
    symbol,
    assetName: safeText(row.assetName, 240),
    side: ["buy", "sell"].includes(side) ? side : "unknown",
    quantity: safeNonNegative(row.quantity),
    executionPrice: safeNonNegative(row.executionPrice ?? row.price),
    grossValue: safeNonNegative(row.grossValue),
    createdAt: safeText(row.createdAt, 80),
  });
}

function normalizeEvent(row, index) {
  if (!isRecord(row)) return null;
  const headline = safeText(row.headline || row.title, 320);
  if (!headline) return null;
  const status = normalizedStatus(row);
  return Object.freeze({
    rowKey: `market-event-${index + 1}`,
    headline,
    explanation: safeText(row.explanation || row.description, 2_000),
    category: safeText(row.category, 80).toLowerCase(),
    sentiment: safeText(row.sentiment, 40).toLowerCase(),
    source: safeText(row.source, 80),
    magnitude: safeFinite(row.magnitude),
    volatilityImpact: safeFinite(row.volatilityImpact),
    status,
    active: status === "active",
    createdAt: safeText(row.createdAt, 80),
    updatedAt: safeText(row.updatedAt, 80),
  });
}

function normalizeMarketBatch(result) {
  const assetPanel = panel(result, "assets");
  if (assetPanel?.status !== "fulfilled") {
    throw safeError(assetPanel?.reason || createAdminErrorEnvelope({
      code: "INVALID_RESPONSE",
      retryable: true,
    }));
  }
  const assetRows = panelRows(result, "assets", ["assets", "marketplaceSecurities"]);
  if (!assetRows) {
    throw createAdminErrorEnvelope({ code: "INVALID_RESPONSE", retryable: true });
  }

  const resourceIds = new Map();
  const instruments = assetRows.slice(0, 1_000).map((row) => {
    const instrument = normalizeInstrument(row);
    const resourceId = safeResourceId(row);
    if (instrument && resourceId && !resourceIds.has(instrument.rowKey)) {
      resourceIds.set(instrument.rowKey, resourceId);
    }
    return instrument;
  }).filter(Boolean);

  const eventRows = panelRows(result, "events", ["events", "marketEvents", "news"]);
  const tradeRows = panelRows(result, "trades", ["trades", "marketplaceTrades"]);
  const events = (eventRows || []).slice(0, 100).map(normalizeEvent).filter(Boolean);
  const trades = (tradeRows || []).slice(0, 100).map(normalizeTrade).filter(Boolean);
  const sectors = [...new Set(instruments.map((item) => item.sector).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
  const countries = [...new Set(instruments.map((item) => item.countryCode).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));

  const model = deepFreeze({
    instruments,
    events,
    trades,
    sectors,
    countries,
    summary: {
      listedCount: instruments.length,
      sectorCount: sectors.length,
      recentTradeCount: trades.length,
      markedActiveEventCount: events.filter((event) => event.active).length,
    },
    panels: {
      assets: panelStatus(result, "assets"),
      events: panelStatus(result, "events"),
      trades: panelStatus(result, "trades"),
    },
    isEmpty: instruments.length === 0,
  });
  return { model, resourceIds };
}

/** Normalizes Admin Market DTOs while excluding private resource identifiers. */
export function normalizeMarketReadModel(result) {
  return normalizeMarketBatch(result).model;
}

function detailObject(result, key, aliases) {
  const data = panelData(result, key);
  if (!isRecord(data)) return null;
  for (const alias of aliases) {
    if (isRecord(data[alias])) return data[alias];
  }
  return null;
}

function normalizeChart(result) {
  const rows = panelRows(result, "chart", ["candles", "chart"]);
  if (!rows) return Object.freeze([]);
  return Object.freeze(rows.slice(-500).map((row) => {
    if (!isRecord(row)) return null;
    const close = safeNonNegative(row.close ?? row.price);
    if (close === null) return null;
    return Object.freeze({
      rowKey: `history-${safeInteger(row.tickIndex) ?? "point"}-${safeText(row.timestamp || row.time, 80) || "unknown"}`,
      tickIndex: safeInteger(row.tickIndex),
      timestamp: safeText(row.timestamp || row.time, 80),
      close,
      open: safeNonNegative(row.open),
      high: safeNonNegative(row.high),
      low: safeNonNegative(row.low),
      volume: safeNonNegative(row.volume),
      changePct: safeFinite(row.changePct),
    });
  }).filter(Boolean));
}

function normalizeMarketDetail(result, rowKey, fallbackInstrument) {
  const fulfilled = ["profile", "chart", "financials"]
    .filter((key) => panel(result, key)?.status === "fulfilled");
  if (fulfilled.length === 0) {
    const failure = ["profile", "chart", "financials"]
      .map((key) => panel(result, key)?.reason)
      .find(Boolean);
    throw safeError(failure || createAdminErrorEnvelope({
      code: "REQUEST_FAILED",
      retryable: true,
    }));
  }

  const profileRow = detailObject(result, "profile", ["asset", "profile"]);
  const normalizedProfile = profileRow ? normalizeInstrument(profileRow) : null;
  const profile = normalizedProfile?.rowKey === rowKey
    ? normalizedProfile
    : fallbackInstrument || null;
  const financials = detailObject(result, "financials", ["fundamentals", "financials"]);
  return deepFreeze({
    rowKey,
    profile,
    chart: normalizeChart(result),
    fundamentals: normalizeFundamentals(financials || profile?.fundamentals),
    panels: {
      profile: panelStatus(result, "profile"),
      chart: panelStatus(result, "chart"),
      financials: panelStatus(result, "financials"),
    },
  });
}

/** Owns Market reads, filters, lazy detail state, and deterministic cancellation. */
export function createMarketController({
  api,
  selectedGameId,
  hasPermission = () => false,
  onChange = () => {},
} = {}) {
  for (const method of ["readMarket", "readMarketDetail"]) {
    if (typeof api?.[method] !== "function") throw new TypeError(`Market API ${method} is unavailable.`);
  }

  let state = createAdminDataState();
  let detailState = createAdminDataState();
  let filters = Object.freeze({
    query: "",
    sector: "all",
    type: "all",
    status: "all",
    country: "all",
  });
  let resourceIds = new Map();
  let requestVersion = 0;
  let detailRequestVersion = 0;
  let selectedRowKey = "";
  let destroyed = false;
  let currentView = null;

  function publish() {
    if (!destroyed) onChange(state);
  }

  function publishDetail() {
    if (!destroyed) currentView?.updateDetail?.(detailState, selectedRowKey);
  }

  async function load() {
    if (destroyed || !hasPermission("market.manage")) return state;
    api.cancelMarketRequest?.();
    requestVersion += 1;
    const version = requestVersion;
    state = beginAdminDataLoad(state, { requestVersion: version });
    publish();

    try {
      const result = await api.readMarket({ gameId: selectedGameId });
      if (destroyed || version !== requestVersion || result?.current === false) return state;
      const normalized = normalizeMarketBatch(result);
      resourceIds = normalized.resourceIds;
      state = resolveAdminDataLoad(state, normalized.model, {
        empty: normalized.model.isEmpty,
        requestVersion: version,
      });
      if (selectedRowKey && !normalized.model.instruments.some((item) => item.rowKey === selectedRowKey)) {
        api.cancelMarketDetailRequest?.();
        selectedRowKey = "";
        detailRequestVersion += 1;
        detailState = createAdminDataState({ requestVersion: detailRequestVersion });
      }
    } catch (error) {
      if (destroyed || version !== requestVersion) return state;
      state = rejectAdminDataLoad(state, safeError(error), { requestVersion: version });
    }
    publish();
    return state;
  }

  async function loadDetail(value) {
    if (destroyed || !hasPermission("market.manage")) return detailState;
    const rowKey = safeTicker(isRecord(value) ? value.rowKey || value.symbol : value);
    const instrument = state.data?.instruments?.find((item) => item.rowKey === rowKey) || null;
    const resourceId = resourceIds.get(rowKey);
    api.cancelMarketDetailRequest?.();
    detailRequestVersion += 1;
    const version = detailRequestVersion;
    selectedRowKey = rowKey;
    detailState = beginAdminDataLoad(
      rowKey === detailState.data?.rowKey ? detailState : createAdminDataState(),
      { requestVersion: version },
    );

    if (!rowKey || !instrument || !resourceId) {
      detailState = rejectAdminDataLoad(
        detailState,
        createAdminErrorEnvelope({ code: "NOT_FOUND", retryable: false }),
        { requestVersion: version },
      );
      publishDetail();
      return detailState;
    }
    publishDetail();

    try {
      const result = await api.readMarketDetail({
        gameId: selectedGameId,
        resourceId,
      });
      if (destroyed || version !== detailRequestVersion || result?.current === false) {
        return detailState;
      }
      const detail = normalizeMarketDetail(result, rowKey, instrument);
      detailState = resolveAdminDataLoad(detailState, detail, {
        empty: false,
        requestVersion: version,
      });
    } catch (error) {
      if (destroyed || version !== detailRequestVersion) return detailState;
      detailState = rejectAdminDataLoad(detailState, safeError(error), {
        requestVersion: version,
      });
    }
    publishDetail();
    return detailState;
  }

  function updateFilters(nextFilters = {}) {
    const type = safeFilterText(nextFilters.type ?? filters.type);
    const status = safeFilterText(nextFilters.status ?? filters.status);
    filters = Object.freeze({
      query: safeText(nextFilters.query ?? filters.query, 160),
      sector: safeFilterText(nextFilters.sector ?? filters.sector),
      type: ["all", "stock", "unknown"].includes(type) ? type : "all",
      status: ["all", "active", "inactive", "recent", "unknown"].includes(status)
        ? status
        : "all",
      country: safeFilterText(nextFilters.country ?? filters.country),
    });
    currentView?.updateFilters?.(filters);
    return filters;
  }

  function render() {
    if (destroyed) throw new Error("Market controller has been destroyed.");
    currentView?.destroy?.();
    currentView = MarketRoute({
      state,
      filters,
      detailState,
      selectedRowKey,
      onFiltersChange: updateFilters,
      onRefresh: load,
      onSelect: loadDetail,
      loadDetail,
    });
    return currentView;
  }

  function settleCancelledState(current, version) {
    if (!current.hasResolved) return createAdminDataState();
    if (current.status !== ADMIN_DATA_STATES.REFRESHING) return current;
    return createAdminDataState({
      status: current.data?.isEmpty ? ADMIN_DATA_STATES.EMPTY : ADMIN_DATA_STATES.READY,
      data: current.data,
      hasResolved: true,
      requestVersion: version,
      updatedAt: current.updatedAt,
    });
  }

  function cancelForDeactivation() {
    if (api.cancelMarketRequest?.() === true) {
      requestVersion += 1;
      state = settleCancelledState(state, requestVersion);
    }
    if (api.cancelMarketDetailRequest?.() === true) {
      detailRequestVersion += 1;
      detailState = settleCancelledState(detailState, detailRequestVersion);
    }
  }

  return Object.freeze({
    getState: () => state,
    getFilters: () => filters,
    getDetailState: () => detailState,
    getSelectedRowKey: () => selectedRowKey,
    load,
    loadDetail,
    updateFilters,
    render,
    deactivate() {
      cancelForDeactivation();
      currentView?.destroy?.();
      currentView = null;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      requestVersion += 1;
      detailRequestVersion += 1;
      api.cancelMarketRequest?.();
      api.cancelMarketDetailRequest?.();
      currentView?.destroy?.();
      currentView = null;
      resourceIds.clear();
      selectedRowKey = "";
    },
  });
}
