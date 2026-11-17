import {
  ADMIN_DATA_STATES,
  beginAdminDataLoad,
  createAdminDataState,
  rejectAdminDataLoad,
  resolveAdminDataLoad,
} from "../../core/data-state.js";
import { createAdminErrorEnvelope } from "../../core/error-envelope.js";
import { MarketRoute } from "./MarketRoute.js";

import {
  isRecord,
  normalizeMarketBatch,
  normalizeMarketDetail,
  safeError,
  safeFilterText,
  safeText,
  safeTicker,
} from "./MarketReadModel.js";

// Preserve the existing public controller module's read-model entry point.
export { normalizeMarketReadModel } from "./MarketReadModel.js";

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
