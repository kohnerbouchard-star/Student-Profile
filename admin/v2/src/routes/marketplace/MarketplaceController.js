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
import { MarketplaceRoute } from "./MarketplaceRoute.js";
import { MARKETPLACE_LISTING_STATUSES, normalizeMarketplaceReadModel } from "./MarketplaceReadModel.js";

// Preserve the controller entry point for existing consumers.
export { normalizeMarketplaceReadModel } from "./MarketplaceReadModel.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FILTER_STATUSES = new Set(["all", ...MARKETPLACE_LISTING_STATUSES, "disputed"]);

function safeError(error) {
  return isAdminErrorEnvelope(error) ? error : normalizeAdminError(error, { fieldErrors: error?.fieldErrors });
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

/** Owns Marketplace moderation reads, existing mutations, filters, and six-state lifecycle. */
export function createMarketplaceController({
  api,
  selectedGameId,
  hasPermission = () => false,
  onChange = () => {},
  notify = () => {},
  cryptoObject = globalThis.crypto,
} = {}) {
  for (const method of ["readMarketplace", "reviewListing", "reviewDispute", "updatePolicy"]) {
    if (typeof api?.[method] !== "function") throw new TypeError(`Marketplace API ${method} is unavailable.`);
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
    if (destroyed || !hasPermission("marketplace.moderate")) return state;
    api.cancelMarketplaceRequest?.();
    requestVersion += 1;
    const version = requestVersion;
    state = beginAdminDataLoad(state, { requestVersion: version });
    publish();
    try {
      const result = await api.readMarketplace({ gameId: selectedGameId });
      if (destroyed || version !== requestVersion || result?.current === false) return state;
      const model = normalizeMarketplaceReadModel(result);
      state = resolveAdminDataLoad(state, model, { empty: model.isEmpty, requestVersion: version });
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
    if (!UUID_PATTERN.test(uuid)) throw createAdminErrorEnvelope({ code: "INVALID_REQUEST", retryable: false });
    return `admin.marketplace.${action}.${uuid}.${mutationSequence}`.slice(0, 159);
  }

  async function mutate({ action, target = null, input = null, request, successTitle, successMessage }) {
    if (destroyed || !hasPermission("marketplace.moderate")) {
      return { ok: false, error: createAdminErrorEnvelope({ code: "PERMISSION_DENIED", retryable: false }) };
    }
    const fingerprint = stableStringify({ action, targetId: target?.id || null, input });
    if (activeMutations.has(fingerprint)) {
      return { ok: false, busy: true, error: createAdminErrorEnvelope({ code: "CONFLICT", retryable: false }) };
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
      if (!destroyed) scheduleAuthoritativeRefresh();
      return { ok: true, result, refreshScheduled: !destroyed };
    } catch (error) {
      const envelope = safeError(error);
      if (!envelope.retryable) pendingIdempotency.delete(fingerprint);
      if (!destroyed) notify({ tone: "error", title: "Marketplace action was not saved", message: envelope.userMessage });
      return { ok: false, error: envelope };
    } finally {
      activeMutations.delete(fingerprint);
    }
  }

  function moderateListing(listing, action, reason) {
    if (!listing?.id || !listing.id.startsWith("lst_")) {
      return Promise.resolve({ ok: false, error: createAdminErrorEnvelope({ code: "NOT_FOUND", retryable: false }) });
    }
    const normalizedAction = String(action || "").trim().toLowerCase();
    if (!["hold", "approve", "reject"].includes(normalizedAction)) {
      return Promise.resolve({ ok: false, error: createAdminErrorEnvelope({ code: "INVALID_REQUEST", retryable: false }) });
    }
    const normalizedReason = String(reason || "").trim();
    return mutate({
      action: `listing.${normalizedAction}`,
      target: listing,
      input: { reason: normalizedReason, expectedVersion: listing.version },
      request: (idempotencyKey) => api.reviewListing({
        gameId: selectedGameId,
        listingId: listing.id,
        action: normalizedAction,
        expectedVersion: listing.version,
        reason: normalizedReason,
        idempotencyKey,
      }),
      successTitle: "Marketplace listing reviewed",
      successMessage: `${listing.itemId} was ${normalizedAction === "hold" ? "placed on hold" : normalizedAction === "approve" ? "approved" : "rejected"}.`,
    });
  }

  function moderateDispute(dispute, action, reason) {
    if (!dispute?.id || !dispute.id.startsWith("dsp_")) {
      return Promise.resolve({ ok: false, error: createAdminErrorEnvelope({ code: "NOT_FOUND", retryable: false }) });
    }
    const normalizedAction = String(action || "").trim().toLowerCase();
    if (!["refund", "resolve-seller", "reject"].includes(normalizedAction)) {
      return Promise.resolve({ ok: false, error: createAdminErrorEnvelope({ code: "INVALID_REQUEST", retryable: false }) });
    }
    const normalizedReason = String(reason || "").trim();
    return mutate({
      action: `dispute.${normalizedAction}`,
      target: dispute,
      input: { reason: normalizedReason, expectedVersion: dispute.version },
      request: (idempotencyKey) => api.reviewDispute({
        gameId: selectedGameId,
        disputeId: dispute.id,
        action: normalizedAction,
        expectedVersion: dispute.version,
        reason: normalizedReason,
        idempotencyKey,
      }),
      successTitle: "Marketplace dispute reviewed",
      successMessage: normalizedAction === "refund"
        ? "The buyer refund was committed."
        : normalizedAction === "resolve-seller"
          ? "The dispute was resolved for the seller."
          : "The dispute was rejected.",
    });
  }

  function savePolicy(policy) {
    return mutate({
      action: "policy.update",
      input: policy,
      request: (idempotencyKey) => api.updatePolicy({ gameId: selectedGameId, policy, idempotencyKey }),
      successTitle: "Marketplace policy updated",
      successMessage: "The authoritative Marketplace policy was committed.",
    });
  }

  function updateFilters(nextFilters = {}) {
    const status = String(nextFilters.status ?? filters.status).trim().toLowerCase();
    filters = Object.freeze({
      query: String(nextFilters.query ?? filters.query).trimStart().slice(0, 180),
      status: FILTER_STATUSES.has(status) ? status : "all",
    });
  }

  function render() {
    if (destroyed) throw new Error("Marketplace controller has been destroyed.");
    currentView?.destroy?.();
    currentView = MarketplaceRoute({
      state,
      filters,
      onFiltersChange: updateFilters,
      onRefresh: load,
      onModerateListing: moderateListing,
      onModerateDispute: moderateDispute,
      onUpdatePolicy: savePolicy,
    });
    return currentView;
  }

  function cancelReadForDeactivation() {
    if (api.cancelMarketplaceRequest?.() !== true) return;
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
    moderateListing,
    moderateDispute,
    savePolicy,
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
      api.cancelMarketplaceRequest?.();
      refreshTimers.forEach((timer) => globalThis.clearTimeout(timer));
      refreshTimers.clear();
      currentView?.destroy?.();
      currentView = null;
      pendingIdempotency.clear();
      activeMutations.clear();
    },
  });
}
