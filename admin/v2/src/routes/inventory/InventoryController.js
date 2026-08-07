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
import { InventoryRoute } from "./InventoryRoute.js";

import {
  normalizeInventoryReadModel,
  normalizeInventoryRedemption,
  safeInventoryRequestId,
  safeInventoryText,
  summarizeInventoryRedemptions,
} from "./InventoryModel.js";

const FILTER_STATUSES = new Set(["pending", "approved", "rejected", "fulfilled", "all"]);
const ACTIONS = new Set(["approve", "reject", "fulfill"]);

function safeError(error) {
  return isAdminErrorEnvelope(error) ? error : normalizeAdminError(error);
}

function defaultFilters() {
  return Object.freeze({ query: "", status: "pending", limit: 25, offset: 0 });
}

function normalizeFilterStatus(value, fallback = "pending") {
  const status = String(value || "").trim().toLowerCase();
  return FILTER_STATUSES.has(status) ? status : fallback;
}

function normalizedQuery(value) {
  return safeInventoryText(value, 160).toLowerCase();
}

function allowedActions(status) {
  if (status === "pending") return new Set(["approve", "reject"]);
  if (status === "approved") return new Set(["fulfill"]);
  return new Set();
}

function requestIdentity(action, requestId) {
  const runtimeCrypto = globalThis.crypto;
  let suffix = "";
  if (typeof runtimeCrypto?.randomUUID === "function") {
    suffix = runtimeCrypto.randomUUID();
  } else if (typeof runtimeCrypto?.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    runtimeCrypto.getRandomValues(bytes);
    suffix = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  }
  if (!suffix) throw createAdminErrorEnvelope({ code: "REQUEST_FAILED", retryable: false });
  return `admin-inventory:${action}:${requestId}:${suffix}`.slice(0, 128);
}

function settleCancelledState(current, version) {
  if (!current.hasResolved) return createAdminDataState({ requestVersion: version });
  if (current.status !== ADMIN_DATA_STATES.REFRESHING) return current;
  return createAdminDataState({
    status: current.data?.isEmpty ? ADMIN_DATA_STATES.EMPTY : ADMIN_DATA_STATES.READY,
    data: current.data,
    hasResolved: true,
    requestVersion: version,
    updatedAt: current.updatedAt,
  });
}

/** Owns Inventory redemption supervision without creating another inventory source of truth. */
export function createInventoryController({
  api,
  selectedGameId,
  hasPermission = () => false,
  onChange = () => {},
  notify = () => {},
} = {}) {
  for (const method of ["list", "review"]) {
    if (typeof api?.[method] !== "function") throw new TypeError(`Inventory API ${method} is unavailable.`);
  }

  let state = createAdminDataState();
  let filters = defaultFilters();
  let requestVersion = 0;
  let loadController = null;
  let destroyed = false;
  let currentView = null;

  function publish() {
    if (!destroyed) onChange(state);
  }

  async function load({ status = filters.status, offset = filters.offset } = {}) {
    if (destroyed || !hasPermission("inventory.redeem")) return state;
    const nextStatus = normalizeFilterStatus(status, filters.status);
    const nextOffset = Number.isSafeInteger(Number(offset)) && Number(offset) >= 0 ? Number(offset) : 0;
    filters = Object.freeze({ ...filters, status: nextStatus, offset: nextOffset });

    loadController?.abort();
    loadController = new AbortController();
    requestVersion += 1;
    const version = requestVersion;
    state = beginAdminDataLoad(state, { requestVersion: version });
    publish();

    try {
      const queue = await api.list({
        gameId: selectedGameId,
        status: filters.status,
        limit: filters.limit,
        offset: filters.offset,
        signal: loadController.signal,
      });
      if (destroyed || version !== requestVersion || loadController.signal.aborted) return state;
      const model = normalizeInventoryReadModel(queue);
      state = resolveAdminDataLoad(state, model, {
        empty: model.isEmpty,
        requestVersion: version,
      });
    } catch (error) {
      if (destroyed || version !== requestVersion || loadController?.signal.aborted) return state;
      state = rejectAdminDataLoad(state, safeError(error), { requestVersion: version });
    }
    publish();
    return state;
  }

  function updateQuery(value) {
    filters = Object.freeze({ ...filters, query: normalizedQuery(value) });
    currentView?.updateFilters?.(filters);
    return filters;
  }

  function selectStatus(value) {
    filters = Object.freeze({ ...filters, status: normalizeFilterStatus(value), offset: 0 });
    return load({ status: filters.status, offset: 0 });
  }

  function changePage(delta) {
    const step = Number(delta);
    if (!Number.isSafeInteger(step) || step === 0) return Promise.resolve(state);
    const nextOffset = Math.max(0, filters.offset + step * filters.limit);
    if (step > 0 && !state.data?.pagination?.hasMore) return Promise.resolve(state);
    if (nextOffset === filters.offset) return Promise.resolve(state);
    return load({ offset: nextOffset });
  }

  async function review({ rowKey, action, note = "" } = {}) {
    if (destroyed || !hasPermission("inventory.redeem")) {
      throw createAdminErrorEnvelope({ code: "PERMISSION_DENIED", retryable: false });
    }
    const requestId = safeInventoryRequestId(rowKey);
    const normalizedAction = safeInventoryText(action, 24).toLowerCase();
    const row = state.data?.redemptions?.find((candidate) => candidate.requestId === requestId) || null;
    if (!requestId || !row || !ACTIONS.has(normalizedAction)) {
      throw createAdminErrorEnvelope({ code: "INVALID_REQUEST", retryable: false });
    }
    if (!allowedActions(row.status).has(normalizedAction)) {
      throw createAdminErrorEnvelope({ code: "CONFLICT", retryable: false });
    }
    const reviewNote = safeInventoryText(note, 1000);
    if (normalizedAction === "reject" && !reviewNote) {
      throw createAdminErrorEnvelope({ code: "VALIDATION_FAILED", retryable: false });
    }

    try {
      const result = await api.review({
        gameId: selectedGameId,
        requestId,
        action: normalizedAction,
        note: reviewNote,
        idempotencyKey: requestIdentity(normalizedAction, requestId),
      });
      notify({
        tone: "success",
        title: result.outcome === "replayed" ? "Redemption already updated" : "Redemption updated",
        message: result.outcome === "replayed"
          ? "The previously committed inventory result is shown."
          : `${normalizedAction === "fulfill" ? "Fulfillment" : "Review"} was committed to the canonical inventory workflow.`,
      });
      return result;
    } catch (error) {
      throw safeError(error);
    }
  }

  function applyReviewResult(result) {
    const normalized = normalizeInventoryRedemption(result?.redemption);
    if (!normalized || !state.data) return void load();
    const currentRows = [...state.data.redemptions];
    const index = currentRows.findIndex((row) => row.requestId === normalized.requestId);
    const keep = filters.status === "all" || normalized.status === filters.status;
    if (index >= 0 && keep) currentRows[index] = normalized;
    else if (index >= 0) currentRows.splice(index, 1);
    else if (keep) currentRows.unshift(normalized);

    const optimisticModel = Object.freeze({
      ...state.data,
      redemptions: Object.freeze(currentRows),
      summary: summarizeInventoryRedemptions(currentRows),
      pagination: Object.freeze({ ...state.data.pagination, returned: currentRows.length }),
      isEmpty: currentRows.length === 0,
    });
    state = resolveAdminDataLoad(state, optimisticModel, {
      empty: optimisticModel.isEmpty,
      requestVersion: state.requestVersion,
    });
    publish();
    void load();
  }

  function render() {
    if (destroyed) throw new Error("Inventory controller has been destroyed.");
    currentView?.destroy?.();
    currentView = InventoryRoute({
      state,
      filters,
      onQueryChange: updateQuery,
      onStatusChange: selectStatus,
      onPage: changePage,
      onRefresh: load,
      onReview: review,
      onReviewCommitted: applyReviewResult,
    });
    return currentView;
  }

  function deactivate() {
    if (loadController && !loadController.signal.aborted) {
      loadController.abort();
      requestVersion += 1;
      state = settleCancelledState(state, requestVersion);
    }
    currentView?.destroy?.();
    currentView = null;
  }

  return Object.freeze({
    getState: () => state,
    getFilters: () => filters,
    load,
    updateQuery,
    selectStatus,
    changePage,
    review,
    applyReviewResult,
    render,
    deactivate,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      requestVersion += 1;
      loadController?.abort();
      currentView?.destroy?.();
      currentView = null;
    },
  });
}
