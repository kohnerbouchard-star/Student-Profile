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
import { StoreRoute } from "./StoreRoute.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_IN_TEXT_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const ITEM_KEY_PATTERN = /^[a-z0-9_-]{1,64}$/;
const CATEGORY_PATTERN = /^[a-z0-9_-]{1,32}$/;
const STORE_STATUSES = new Set(["active", "disabled", "archived"]);
const STORE_VISIBILITIES = new Set(["visible", "hidden"]);

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeText(value, maximum = 500) {
  const text = String(value ?? "").trim();
  if (!text || UUID_IN_TEXT_PATTERN.test(text)) return "";
  return text.slice(0, maximum);
}

function safeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function safeInteger(value) {
  const number = safeNumber(value);
  return Number.isSafeInteger(number) ? number : null;
}

function safeResourceId(row) {
  const value = String(row?.id || row?.storeItemId || row?.itemUuid || "").trim().toLowerCase();
  return UUID_PATTERN.test(value) ? value : null;
}

function safeItemKey(row) {
  const value = String(row?.itemKey || row?.key || "").trim().toLowerCase();
  return ITEM_KEY_PATTERN.test(value) ? value : "";
}

function itemArray(result) {
  if (Array.isArray(result)) return result;
  const candidates = [
    result,
    result?.value,
    result?.data,
    result?.data?.data,
    result?.payload,
    result?.result,
  ].filter(isRecord);
  for (const candidate of candidates) {
    if (Array.isArray(candidate.items)) return candidate.items;
    if (Array.isArray(candidate.storeItems)) return candidate.storeItems;
    if (Array.isArray(candidate.Store)) return candidate.Store;
  }
  return null;
}

function normalizePurchaseStats(row) {
  const source = isRecord(row?.purchaseStats) ? row.purchaseStats : {};
  return Object.freeze({
    purchaseCount: safeInteger(source.purchaseCount),
    unitsSold: safeInteger(source.unitsSold),
    revenue: safeNumber(source.revenue),
  });
}

function normalizeStoreItem(row, index) {
  if (!isRecord(row)) return null;
  const itemKey = safeItemKey(row);
  const categoryValue = String(row.category || "").trim().toLowerCase();
  const statusValue = String(row.status || "").trim().toLowerCase();
  const visibilityValue = String(row.visibility || "").trim().toLowerCase();
  return Object.freeze({
    resourceId: safeResourceId(row),
    rowKey: itemKey || `store-item-${index + 1}`,
    itemKey,
    name: safeText(row.name || row.title, 240) || "Unnamed Store item",
    description: safeText(row.description, 2_000),
    category: CATEGORY_PATTERN.test(categoryValue) ? categoryValue : "",
    price: safeNumber(row.price),
    currencyCode: safeText(row.currencyCode, 16).toUpperCase(),
    stockQuantity: safeInteger(row.stockQuantity ?? row.stock),
    status: STORE_STATUSES.has(statusValue) ? statusValue : "",
    visibility: STORE_VISIBILITIES.has(visibilityValue) ? visibilityValue : "",
    sortOrder: Number.isSafeInteger(Number(row.sortOrder)) ? Number(row.sortOrder) : 0,
    purchaseStats: normalizePurchaseStats(row),
    createdAt: safeText(row.createdAt, 80),
    updatedAt: safeText(row.updatedAt, 80),
  });
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

/** Normalizes the staff Store DTO without admitting private IDs to presentation fields. */
export function normalizeStoreReadModel(result) {
  const rows = itemArray(result);
  if (!rows) {
    throw createAdminErrorEnvelope({ code: "INVALID_RESPONSE", retryable: true });
  }
  const items = rows.slice(0, 1_000).map(normalizeStoreItem).filter(Boolean);
  const categories = [...new Set(items.map((item) => item.category).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
  return deepFreeze({
    items,
    categories,
    summary: {
      activeCount: items.filter((item) => item.status === "active").length,
      outOfStockCount: items.filter((item) => item.status !== "archived" && item.stockQuantity === 0).length,
      finiteStockCount: items.filter((item) => item.stockQuantity !== null).length,
    },
    isEmpty: items.length === 0,
  });
}

function safeError(error) {
  return isAdminErrorEnvelope(error)
    ? error
    : normalizeAdminError(error, { fieldErrors: error?.fieldErrors });
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function successfulMutation(result) {
  if (result?.ok === false) throw result;
  return result;
}

/** Owns Store reads, mutations, idempotency, route view lifecycle, and cancellation. */
export function createStoreController({
  api,
  selectedGameId,
  hasPermission = () => false,
  onChange = () => {},
  notify = () => {},
  cryptoObject = globalThis.crypto,
} = {}) {
  for (const method of ["readStore", "createStoreItem", "updateStoreItem", "archiveStoreItem"]) {
    if (typeof api?.[method] !== "function") throw new TypeError(`Store API ${method} is unavailable.`);
  }

  let state = createAdminDataState();
  let filters = Object.freeze({ query: "", status: "all", category: "all" });
  let requestVersion = 0;
  let mutationSequence = 0;
  let destroyed = false;
  let currentView = null;
  const pendingIdempotency = new Map();
  const activeMutations = new Set();
  const refreshTimers = new Set();

  function publish() {
    if (!destroyed) onChange(state);
  }

  async function load() {
    if (destroyed || !hasPermission("store.manage")) return state;
    api.cancelStoreRequest?.();
    requestVersion += 1;
    const version = requestVersion;
    state = beginAdminDataLoad(state, { requestVersion: version });
    publish();

    try {
      const result = await api.readStore({ gameId: selectedGameId });
      if (destroyed || version !== requestVersion || result?.current === false) return state;
      const model = normalizeStoreReadModel(result);
      state = resolveAdminDataLoad(state, model, {
        empty: model.isEmpty,
        requestVersion: version,
      });
    } catch (error) {
      if (destroyed || version !== requestVersion) return state;
      state = rejectAdminDataLoad(state, safeError(error), { requestVersion: version });
    }
    publish();
    return state;
  }

  function scheduleAuthoritativeRefresh() {
    const timer = globalThis.setTimeout(() => {
      refreshTimers.delete(timer);
      if (!destroyed) void load();
    }, 0);
    refreshTimers.add(timer);
  }

  function nextIdempotencyKey(action) {
    mutationSequence += 1;
    const uuid = String(cryptoObject?.randomUUID?.() || "").trim().toLowerCase();
    if (!UUID_PATTERN.test(uuid)) {
      throw createAdminErrorEnvelope({ code: "INVALID_REQUEST", retryable: false });
    }
    return `admin.store.${action}.${uuid}.${mutationSequence}`.slice(0, 159);
  }

  async function mutate({ action, item = null, input = null, request, successTitle, successMessage }) {
    if (destroyed || !hasPermission("store.manage")) {
      return {
        ok: false,
        error: createAdminErrorEnvelope({ code: "PERMISSION_DENIED", retryable: false }),
      };
    }
    const fingerprint = stableStringify({ action, itemId: item?.resourceId || null, input });
    if (activeMutations.has(fingerprint)) {
      return {
        ok: false,
        busy: true,
        error: createAdminErrorEnvelope({ code: "CONFLICT", retryable: false }),
      };
    }

    let idempotencyKey = pendingIdempotency.get(fingerprint);
    try {
      if (!idempotencyKey) {
        idempotencyKey = nextIdempotencyKey(action);
        pendingIdempotency.set(fingerprint, idempotencyKey);
      }
    } catch (error) {
      return { ok: false, error: safeError(error) };
    }

    activeMutations.add(fingerprint);
    try {
      const result = successfulMutation(await request(idempotencyKey));
      pendingIdempotency.delete(fingerprint);
      if (!destroyed) notify({ tone: "success", title: successTitle, message: successMessage });
      // Return the committed mutation outcome independently from the follow-up
      // read: a failed refetch becomes stale Store data, never a false mutation
      // failure or an invitation to submit the command again with a new key.
      if (!destroyed) scheduleAuthoritativeRefresh();
      return { ok: true, result, refreshScheduled: !destroyed };
    } catch (error) {
      const envelope = safeError(error);
      if (!envelope.retryable) pendingIdempotency.delete(fingerprint);
      if (!destroyed) {
        notify({
          tone: "error",
          title: "Store item was not saved",
          message: envelope.userMessage,
        });
      }
      return { ok: false, error: envelope };
    } finally {
      activeMutations.delete(fingerprint);
    }
  }

  function createItem(input) {
    return mutate({
      action: "create",
      input,
      request: (idempotencyKey) => api.createStoreItem({
        gameId: selectedGameId,
        item: input,
        idempotencyKey,
      }),
      successTitle: "Store item added",
      successMessage: `${safeText(input?.name, 240) || "The Store item"} was added.`,
    });
  }

  function updateItem(item, input) {
    if (!item?.resourceId) {
      return Promise.resolve({
        ok: false,
        error: createAdminErrorEnvelope({ code: "NOT_FOUND", retryable: false }),
      });
    }
    return mutate({
      action: "update",
      item,
      input,
      request: (idempotencyKey) => api.updateStoreItem({
        gameId: selectedGameId,
        itemId: item.resourceId,
        changes: input,
        idempotencyKey,
      }),
      successTitle: "Store item updated",
      successMessage: `${item.name} was updated.`,
    });
  }

  function archiveItem(item) {
    if (!item?.resourceId) {
      return Promise.resolve({
        ok: false,
        error: createAdminErrorEnvelope({ code: "NOT_FOUND", retryable: false }),
      });
    }
    return mutate({
      action: "archive",
      item,
      request: (idempotencyKey) => api.archiveStoreItem({
        gameId: selectedGameId,
        itemId: item.resourceId,
        idempotencyKey,
      }),
      successTitle: "Store item archived",
      successMessage: `${item.name} was archived.`,
    });
  }

  function updateFilters(nextFilters = {}) {
    const status = String(nextFilters.status || filters.status).toLowerCase();
    const category = String(nextFilters.category || filters.category).toLowerCase();
    filters = Object.freeze({
      query: String(nextFilters.query ?? filters.query).trimStart().slice(0, 160),
      status: ["all", "active", "disabled", "archived", "out-of-stock"].includes(status)
        ? status
        : "all",
      category: category === "all" || CATEGORY_PATTERN.test(category) ? category : "all",
    });
  }

  function render() {
    if (destroyed) throw new Error("Store controller has been destroyed.");
    currentView?.destroy?.();
    currentView = StoreRoute({
      state,
      filters,
      onFiltersChange: updateFilters,
      onRefresh: load,
      onCreate: createItem,
      onEdit: updateItem,
      onArchive: archiveItem,
    });
    return currentView;
  }

  function cancelReadForDeactivation() {
    if (api.cancelStoreRequest?.() !== true) return;
    requestVersion += 1;
    if (!state.hasResolved) {
      requestVersion = 0;
      state = createAdminDataState();
      return;
    }
    if (state.status === ADMIN_DATA_STATES.REFRESHING) {
      state = createAdminDataState({
        status: state.data?.isEmpty ? ADMIN_DATA_STATES.EMPTY : ADMIN_DATA_STATES.READY,
        data: state.data,
        hasResolved: true,
        requestVersion,
        updatedAt: state.updatedAt,
      });
    }
  }

  return Object.freeze({
    getState: () => state,
    getFilters: () => filters,
    load,
    createItem,
    updateItem,
    archiveItem,
    render,
    deactivate() {
      cancelReadForDeactivation();
      currentView?.destroy?.();
      currentView = null;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      requestVersion += 1;
      api.cancelStoreRequest?.();
      refreshTimers.forEach((timer) => globalThis.clearTimeout(timer));
      refreshTimers.clear();
      currentView?.destroy?.();
      currentView = null;
      pendingIdempotency.clear();
      activeMutations.clear();
    },
  });
}
