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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_IN_TEXT_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const PUBLIC_ID_PATTERN = /^(?:lst|mpr|ord|dsp|mae|mfp)_[0-9a-f]{32}$/;
const LISTING_STATUSES = new Set(["draft", "active", "moderation_hold", "sold", "cancelled", "expired", "rejected"]);
const RESERVATION_STATUSES = new Set(["pending", "reserved", "completed", "released", "expired", "cancelled"]);
const ORDER_STATUSES = new Set(["completed", "refunded", "disputed", "cancelled", "pending", "settled"]);
const DISPUTE_STATUSES = new Set(["open", "resolved_buyer", "resolved_seller", "rejected", "closed"]);
const FILTER_STATUSES = new Set(["all", ...LISTING_STATUSES, "disputed"]);

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeText(value, maximum = 1_000) {
  const text = String(value ?? "").trim();
  if (!text || UUID_IN_TEXT_PATTERN.test(text)) return "";
  return text.slice(0, maximum);
}

function safeToken(value, maximum = 128) {
  const token = String(value ?? "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]*$/.test(token) ? token.slice(0, maximum) : "";
}

function publicId(value, prefix = "") {
  const id = String(value ?? "").trim().toLowerCase();
  if (!PUBLIC_ID_PATTERN.test(id)) return "";
  return prefix && !id.startsWith(`${prefix}_`) ? "" : id;
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

function safeDate(value) {
  const text = String(value ?? "").trim();
  return text && Number.isFinite(Date.parse(text)) ? text.slice(0, 80) : "";
}

function safeCurrency(value) {
  const code = String(value ?? "").trim().toUpperCase();
  return /^[A-Z0-9]{3,12}$/.test(code) ? code : "";
}

function safeCountryCode(value) {
  const code = String(value ?? "").trim().toUpperCase();
  return /^[A-Z0-9_-]{2,24}$/.test(code) ? code : "";
}

function safePlayer(value) {
  if (!isRecord(value)) return Object.freeze({ displayName: "Player" });
  return Object.freeze({ displayName: safeText(value.displayName, 180) || "Player" });
}

function normalizeListing(row, index) {
  if (!isRecord(row)) return null;
  const id = publicId(row.id, "lst");
  if (!id) return null;
  const status = safeToken(row.status);
  return Object.freeze({
    id,
    rowKey: id || `marketplace-listing-${index + 1}`,
    itemId: safeText(row.itemId, 180) || "Unnamed item",
    seller: safePlayer(row.seller),
    countryCode: safeCountryCode(row.countryCode),
    quantityInitial: safeInteger(row.quantityInitial),
    quantityAvailable: safeInteger(row.quantityAvailable),
    unitPrice: safeNumber(row.unitPrice),
    currencyCode: safeCurrency(row.currencyCode),
    condition: safeText(row.condition, 80),
    status: LISTING_STATUSES.has(status) ? status : status || "unknown",
    version: Math.max(1, safeInteger(row.version) || 1),
    expiresAt: safeDate(row.expiresAt),
    moderationReason: safeText(row.moderationReason, 1_000),
    createdAt: safeDate(row.createdAt),
    updatedAt: safeDate(row.updatedAt),
  });
}

function normalizeReservation(row, index) {
  if (!isRecord(row)) return null;
  const id = publicId(row.id, "mpr");
  if (!id) return null;
  const status = safeToken(row.status);
  return Object.freeze({
    id,
    rowKey: id || `marketplace-reservation-${index + 1}`,
    listingId: publicId(row.listingId, "lst"),
    buyer: safePlayer(row.buyer),
    seller: safePlayer(row.seller),
    quantity: safeInteger(row.quantity),
    total: safeNumber(row.total),
    currencyCode: safeCurrency(row.currencyCode),
    status: RESERVATION_STATUSES.has(status) ? status : status || "unknown",
    version: Math.max(1, safeInteger(row.version) || 1),
    expiresAt: safeDate(row.expiresAt),
    releaseReason: safeText(row.releaseReason, 200),
    createdAt: safeDate(row.createdAt),
    updatedAt: safeDate(row.updatedAt),
  });
}

function normalizeOrder(row, index) {
  if (!isRecord(row)) return null;
  const id = publicId(row.id, "ord");
  if (!id) return null;
  const status = safeToken(row.status);
  return Object.freeze({
    id,
    rowKey: id || `marketplace-order-${index + 1}`,
    reservationId: publicId(row.reservationId, "mpr"),
    listingId: publicId(row.listingId, "lst"),
    buyer: safePlayer(row.buyer),
    seller: safePlayer(row.seller),
    itemId: safeText(row.itemId, 180) || "Unnamed item",
    quantity: safeInteger(row.quantity),
    subtotal: safeNumber(row.subtotal),
    feeAmount: safeNumber(row.feeAmount),
    taxAmount: safeNumber(row.taxAmount),
    total: safeNumber(row.total),
    sellerProceeds: safeNumber(row.sellerProceeds),
    currencyCode: safeCurrency(row.currencyCode),
    status: ORDER_STATUSES.has(status) ? status : status || "unknown",
    version: Math.max(1, safeInteger(row.version) || 1),
    completedAt: safeDate(row.completedAt),
    refundedAt: safeDate(row.refundedAt),
    createdAt: safeDate(row.createdAt),
    updatedAt: safeDate(row.updatedAt),
  });
}

function normalizeDispute(row, index) {
  if (!isRecord(row)) return null;
  const id = publicId(row.id, "dsp");
  if (!id) return null;
  const status = safeToken(row.status);
  return Object.freeze({
    id,
    rowKey: id || `marketplace-dispute-${index + 1}`,
    orderId: publicId(row.orderId, "ord"),
    openedBy: safePlayer(row.openedBy),
    reason: safeText(row.reason, 1_000) || "Reason unavailable",
    status: DISPUTE_STATUSES.has(status) ? status : status || "unknown",
    version: Math.max(1, safeInteger(row.version) || 1),
    resolutionNote: safeText(row.resolutionNote, 1_000),
    openedAt: safeDate(row.openedAt),
    resolvedAt: safeDate(row.resolvedAt),
    updatedAt: safeDate(row.updatedAt),
  });
}

function normalizeMetadata(value) {
  if (!isRecord(value)) return Object.freeze({});
  const result = {};
  Object.entries(value).slice(0, 30).forEach(([key, entry]) => {
    const safeKey = safeText(key, 80);
    if (!safeKey || /(uuid|player_id|game_id|session|token|secret)/i.test(safeKey)) return;
    if (typeof entry === "number" && Number.isFinite(entry)) result[safeKey] = entry;
    else if (typeof entry === "boolean") result[safeKey] = entry;
    else if (typeof entry === "string") {
      const safeValue = safeText(entry, 240);
      if (safeValue) result[safeKey] = safeValue;
    }
  });
  return Object.freeze(result);
}

function normalizeAudit(row, index) {
  if (!isRecord(row)) return null;
  const id = publicId(row.id, "mae");
  if (!id) return null;
  return Object.freeze({
    id,
    rowKey: id || `marketplace-audit-${index + 1}`,
    listingId: publicId(row.listingId, "lst"),
    reservationId: publicId(row.reservationId, "mpr"),
    orderId: publicId(row.orderId, "ord"),
    disputeId: publicId(row.disputeId, "dsp"),
    actorType: safeToken(row.actorType) || "system",
    action: safeToken(row.action) || "event",
    metadata: normalizeMetadata(row.metadata),
    createdAt: safeDate(row.createdAt),
  });
}

function normalizePosting(row, index) {
  if (!isRecord(row)) return null;
  const id = publicId(row.id, "mfp");
  if (!id) return null;
  return Object.freeze({
    id,
    rowKey: id || `marketplace-posting-${index + 1}`,
    orderId: publicId(row.orderId, "ord"),
    postingGroup: safeToken(row.postingGroup),
    postingType: safeToken(row.postingType),
    amount: safeNumber(row.amount),
    currencyCode: safeCurrency(row.currencyCode),
    createdAt: safeDate(row.createdAt),
  });
}

function normalizeCountryFeeOverrides(value) {
  if (!isRecord(value)) return Object.freeze({});
  const result = {};
  Object.entries(value).slice(0, 100).forEach(([key, entry]) => {
    const country = safeCountryCode(key);
    const amount = safeNumber(entry);
    if (country && amount !== null && amount <= 0.25) result[country] = amount;
  });
  return Object.freeze(result);
}

function normalizePolicy(value) {
  const row = isRecord(value) ? value : {};
  return Object.freeze({
    marketplaceEnabled: row.marketplaceEnabled !== false,
    crossCountryTradingEnabled: row.crossCountryTradingEnabled !== false,
    moderationRequired: row.moderationRequired === true,
    feeRate: Math.min(0.25, safeNumber(row.feeRate) ?? 0.025),
    taxRate: Math.min(0.25, safeNumber(row.taxRate) ?? 0),
    listingDurationHours: Math.min(720, Math.max(1, safeInteger(row.listingDurationHours) || 168)),
    purchaseReservationMinutes: Math.min(60, Math.max(1, safeInteger(row.purchaseReservationMinutes) || 5)),
    disputeWindowDays: Math.min(30, Math.max(1, safeInteger(row.disputeWindowDays) || 7)),
    disputesEnabled: row.disputesEnabled !== false,
    countryFeeOverrides: normalizeCountryFeeOverrides(row.countryFeeOverrides),
    blockedCountryCodes: Object.freeze(
      Array.isArray(row.blockedCountryCodes)
        ? [...new Set(row.blockedCountryCodes.map(safeCountryCode).filter(Boolean))].slice(0, 100)
        : [],
    ),
    updatedAt: safeDate(row.updatedAt),
  });
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function responseData(result) {
  if (isRecord(result?.data)) return result.data;
  if (isRecord(result?.value?.data)) return result.value.data;
  if (isRecord(result)) return result;
  return null;
}

/** Normalizes the authoritative Marketplace snapshot and removes private ownership identifiers. */
export function normalizeMarketplaceReadModel(result) {
  const data = responseData(result);
  if (!data) throw createAdminErrorEnvelope({ code: "INVALID_RESPONSE", retryable: true });

  const listings = (Array.isArray(data.listings) ? data.listings : []).slice(0, 500).map(normalizeListing).filter(Boolean);
  const reservations = (Array.isArray(data.reservations) ? data.reservations : []).slice(0, 500).map(normalizeReservation).filter(Boolean);
  const orders = (Array.isArray(data.orders) ? data.orders : []).slice(0, 500).map(normalizeOrder).filter(Boolean);
  const disputes = (Array.isArray(data.disputes) ? data.disputes : []).slice(0, 500).map(normalizeDispute).filter(Boolean);
  const audit = (Array.isArray(data.audit) ? data.audit : []).slice(0, 500).map(normalizeAudit).filter(Boolean);
  const postings = (Array.isArray(data.postings) ? data.postings : []).slice(0, 500).map(normalizePosting).filter(Boolean);
  const openDisputeOrderIds = new Set(disputes.filter((item) => item.status === "open").map((item) => item.orderId).filter(Boolean));
  const disputedListingIds = new Set(
    orders.filter((order) => openDisputeOrderIds.has(order.id)).map((order) => order.listingId).filter(Boolean),
  );
  const resolvedListings = listings.map((listing) => Object.freeze({
    ...listing,
    effectiveStatus: disputedListingIds.has(listing.id) ? "disputed" : listing.status,
  }));

  const model = {
    policy: normalizePolicy(data.policy),
    listings: resolvedListings,
    reservations,
    orders,
    disputes,
    audit,
    postings,
    summary: {
      activeListings: resolvedListings.filter((listing) => listing.status === "active").length,
      soldListings: resolvedListings.filter((listing) => listing.status === "sold").length,
      openDisputes: disputes.filter((dispute) => dispute.status === "open").length,
      settledOrders: orders.filter((order) => ["completed", "settled"].includes(order.status)).length,
    },
    isEmpty: resolvedListings.length === 0 && reservations.length === 0 && orders.length === 0 && disputes.length === 0,
  };
  return deepFreeze(model);
}

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
