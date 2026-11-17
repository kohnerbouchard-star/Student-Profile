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
import { isCraftingJobStatus, normalizeCraftingReadModel, safeItemKey } from "./CraftingReadModel.js";
export { normalizeCraftingReadModel } from "./CraftingReadModel.js";

import { CraftingRoute } from "./CraftingRoute.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeError(error) {
  return isAdminErrorEnvelope(error) ? error : normalizeAdminError(error);
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

export function createCraftingController({
  api,
  selectedGameId,
  hasPermission = () => false,
  onChange = () => {},
  notify = () => {},
  cryptoObject = globalThis.crypto,
} = {}) {
  for (const method of ["readCrafting", "recoverCraftingJob", "applyCraftingSupply"]) {
    if (typeof api?.[method] !== "function") throw new TypeError(`Crafting API ${method} is unavailable.`);
  }

  let state = createAdminDataState();
  let filters = Object.freeze({ query: "", status: "all" });
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
    if (destroyed || !hasPermission("inventory.redeem")) return state;
    api.cancelCraftingRequest?.();
    requestVersion += 1;
    const version = requestVersion;
    state = beginAdminDataLoad(state, { requestVersion: version });
    publish();

    try {
      const result = await api.readCrafting({ gameId: selectedGameId, limit: 250 });
      if (destroyed || version !== requestVersion) return state;
      const model = normalizeCraftingReadModel(result);
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
    return `admin.crafting.${action}.${uuid}.${mutationSequence}`.slice(0, 127);
  }

  async function mutate({
    action,
    fingerprintValue,
    request,
    successTitle,
    successMessage,
  }) {
    if (destroyed || !hasPermission("inventory.redeem")) {
      return {
        ok: false,
        error: createAdminErrorEnvelope({ code: "PERMISSION_DENIED", retryable: false }),
      };
    }

    const fingerprint = stableStringify({ action, value: fingerprintValue });
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
      const result = await request(idempotencyKey);
      pendingIdempotency.delete(fingerprint);
      if (!destroyed) {
        notify({ tone: "success", title: successTitle, message: successMessage });
        scheduleAuthoritativeRefresh();
      }
      return { ok: true, result, refreshScheduled: !destroyed };
    } catch (error) {
      const envelope = safeError(error);
      if (!envelope.retryable) pendingIdempotency.delete(fingerprint);
      if (!destroyed) {
        notify({
          tone: "error",
          title: "Crafting operation was not committed",
          message: envelope.userMessage,
        });
      }
      return { ok: false, error: envelope };
    } finally {
      activeMutations.delete(fingerprint);
    }
  }

  function recoverJob(job, input) {
    if (!job?.jobKey) {
      return Promise.resolve({
        ok: false,
        error: createAdminErrorEnvelope({ code: "NOT_FOUND", retryable: false }),
      });
    }
    const outcome = String(input?.outcome || "").trim().toLowerCase();
    const reason = String(input?.reason || "").trim();
    return mutate({
      action: "recover",
      fingerprintValue: { jobKey: job.jobKey, outcome, reason },
      request: (idempotencyKey) => api.recoverCraftingJob({
        gameId: selectedGameId,
        jobKey: job.jobKey,
        outcome,
        reason,
        idempotencyKey,
      }),
      successTitle: outcome === "requeue" ? "Crafting job requeued" : "Crafting job released",
      successMessage: outcome === "requeue"
        ? `${job.recipeName} was returned to authoritative Crafting processing.`
        : `${job.recipeName} was failed and its active Crafting reservations were released by the server.`,
    });
  }

  function applySupply(itemKey, input) {
    const normalizedItemKey = safeItemKey(itemKey);
    if (!normalizedItemKey) {
      return Promise.resolve({
        ok: false,
        error: createAdminErrorEnvelope({ code: "VALIDATION_FAILED", retryable: false }),
      });
    }
    return mutate({
      action: "supply",
      fingerprintValue: { itemKey: normalizedItemKey, input },
      request: (idempotencyKey) => api.applyCraftingSupply({
        gameId: selectedGameId,
        itemKey: normalizedItemKey,
        input,
        idempotencyKey,
      }),
      successTitle: "Crafting supply state updated",
      successMessage: `${normalizedItemKey} supply was updated through the existing physical-economy contract.`,
    });
  }

  function updateFilters(nextFilters = {}) {
    const status = String(nextFilters.status ?? filters.status).trim().toLowerCase();
    filters = Object.freeze({
      query: String(nextFilters.query ?? filters.query).trimStart().slice(0, 160),
      status: status === "all" || isCraftingJobStatus(status) ? status : "all",
    });
  }

  function render() {
    if (destroyed) throw new Error("Crafting controller has been destroyed.");
    currentView?.destroy?.();
    currentView = CraftingRoute({
      state,
      filters,
      onFiltersChange: updateFilters,
      onRefresh: load,
      onRecover: recoverJob,
      onApplySupply: applySupply,
    });
    return currentView;
  }

  function cancelReadForDeactivation() {
    if (api.cancelCraftingRequest?.() !== true) return;
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
    recoverJob,
    applySupply,
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
      api.cancelCraftingRequest?.();
      refreshTimers.forEach((timer) => globalThis.clearTimeout(timer));
      refreshTimers.clear();
      currentView?.destroy?.();
      currentView = null;
      pendingIdempotency.clear();
      activeMutations.clear();
    },
  });
}
