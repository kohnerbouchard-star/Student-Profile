import { createAdminErrorEnvelope } from "../../core/error-envelope.js";

const UUID_IN_TEXT_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const PUBLIC_ID_PATTERN = /^(?:lst|mpr|ord|dsp|mae|mfp)_[0-9a-f]{32}$/;
export const MARKETPLACE_LISTING_STATUSES = Object.freeze(["draft", "active", "moderation_hold", "sold", "cancelled", "expired", "rejected"]);
const LISTING_STATUSES = new Set(MARKETPLACE_LISTING_STATUSES);
const RESERVATION_STATUSES = new Set(["pending", "reserved", "completed", "released", "expired", "cancelled"]);
const ORDER_STATUSES = new Set(["completed", "refunded", "disputed", "cancelled", "pending", "settled"]);
const DISPUTE_STATUSES = new Set(["open", "resolved_buyer", "resolved_seller", "rejected", "closed"]);

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
