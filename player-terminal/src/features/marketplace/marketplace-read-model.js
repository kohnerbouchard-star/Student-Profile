const LISTING = /^lst_[0-9a-f]{32}$/;
const RESERVATION = /^mpr_[0-9a-f]{32}$/;
const ORDER = /^ord_[0-9a-f]{32}$/;
const DISPUTE = /^dsp_[0-9a-f]{32}$/;

function list(value) { return Array.isArray(value) ? value : []; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function text(value, fallback = "", limit = 1200) { const result = typeof value === "string" ? value.trim().slice(0, limit) : ""; return result || fallback; }
function number(value, fallback = 0) { const result = Number(value); return Number.isFinite(result) ? result : fallback; }
function integer(value, fallback = 0) { const result = Number(value); return Number.isSafeInteger(result) ? result : fallback; }
function publicId(value, pattern) { const result = text(value).toLowerCase(); return pattern.test(result) ? result : ""; }
function iso(value) { const result = text(value, "", 80); return Number.isFinite(Date.parse(result)) ? result : ""; }
function categoryImage(item) {
  const itemKey = text(item.itemId).toLowerCase();
  const known = new Set(["advanced-fabricator", "data-chip", "energy-cell-pack", "emergency-repair-kit", "field-permit", "logistics-scanner", "market-lens", "priority-processing-token", "refined-alloy-bundle", "teacher-bonus-coupon", "workshop-access-pass"]);
  if (known.has(itemKey)) return `./assets/store-items/${itemKey}.svg`;
  const category = text(item.category, "custom").toLowerCase();
  const fallback = category.startsWith("equipment") ? "equipment" : category.startsWith("material") ? "material" : category.startsWith("consumable") ? "consumable" : "custom";
  return `./assets/store-items/store-item-${fallback}.svg`;
}
function listing(value) {
  const row = object(value);
  const id = publicId(row.id, LISTING);
  if (!id) return null;
  const status = text(row.status, "draft", 40).toLowerCase();
  if (!["draft", "active", "moderation_hold", "sold_out", "cancelled", "expired", "rejected"].includes(status)) return null;
  const result = {
    id,
    itemId: text(row.itemId, "", 64).toLowerCase(),
    name: text(row.name, "Marketplace item", 180),
    description: text(row.description, "No description is available."),
    category: text(row.category, "Other", 64),
    image: text(row.image, "", 500),
    country: text(row.country, "Game marketplace", 64),
    condition: text(row.condition, "Used", 30),
    seller: text(row.seller, "Player", 180),
    sellerReference: text(row.sellerReference, "", 80) || null,
    unitPrice: Math.max(0, number(row.unitPrice)),
    currencyCode: text(row.currencyCode, "ECO", 12).toUpperCase(),
    quantity: Math.max(0, integer(row.quantity)),
    status,
    version: Math.max(1, integer(row.version, 1)),
    expiresAt: iso(row.expiresAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    moderationReason: text(row.moderationReason, "", 1000) || null,
    mine: row.mine === true
  };
  result.image = result.image || categoryImage(result);
  return Object.freeze(result);
}
function reservation(value) {
  const row = object(value);
  const id = publicId(row.id, RESERVATION);
  const listingId = publicId(row.listingId, LISTING);
  if (!id || !listingId) return null;
  return Object.freeze({
    id, listingId, quantity: Math.max(1, integer(row.quantity, 1)), total: Math.max(0, number(row.total)),
    currencyCode: text(row.currencyCode, "ECO", 12).toUpperCase(),
    status: text(row.status, "reserved", 40).toLowerCase(), version: Math.max(1, integer(row.version, 1)),
    expiresAt: iso(row.expiresAt), releaseReason: text(row.releaseReason, "", 200) || null
  });
}
function order(value) {
  const row = object(value);
  const id = publicId(row.id, ORDER);
  const listingId = publicId(row.listingId, LISTING);
  if (!id || !listingId) return null;
  return Object.freeze({
    id,
    reservationId: publicId(row.reservationId, RESERVATION),
    listingId,
    itemId: text(row.itemId, "", 64).toLowerCase(),
    itemName: text(row.itemName, "Marketplace item", 180),
    quantity: Math.max(1, integer(row.quantity, 1)),
    unitPrice: Math.max(0, number(row.unitPrice)), subtotal: Math.max(0, number(row.subtotal)),
    feeAmount: Math.max(0, number(row.feeAmount)), taxAmount: Math.max(0, number(row.taxAmount)),
    total: Math.max(0, number(row.total)), sellerProceeds: Math.max(0, number(row.sellerProceeds)),
    currencyCode: text(row.currencyCode, "ECO", 12).toUpperCase(),
    status: text(row.status, "completed", 40).toLowerCase(), version: Math.max(1, integer(row.version, 1)),
    role: row.role === "seller" ? "seller" : "buyer", completedAt: iso(row.completedAt), refundedAt: iso(row.refundedAt) || null
  });
}
function dispute(value) {
  const row = object(value);
  const id = publicId(row.id, DISPUTE);
  const orderId = publicId(row.orderId, ORDER);
  if (!id || !orderId) return null;
  return Object.freeze({
    id, orderId, reason: text(row.reason, "", 1000), status: text(row.status, "open", 40).toLowerCase(),
    version: Math.max(1, integer(row.version, 1)), resolutionNote: text(row.resolutionNote, "", 1000) || null,
    openedAt: iso(row.openedAt), resolvedAt: iso(row.resolvedAt) || null
  });
}

export function normalizePlayerMarketplace(response) {
  const root = object(response);
  const body = object(root.marketplace || object(root.data).marketplace || root.data || root);
  const policy = object(body.policy);
  const summary = object(body.summary);
  const listings = list(body.listings).map(listing).filter((item) => item && item.status === "active" && item.quantity > 0 && !item.mine);
  const myListings = list(body.myListings).map(listing).filter(Boolean);
  const reservations = list(body.reservations).map(reservation).filter(Boolean);
  const orders = list(body.orders).map(order).filter(Boolean);
  const disputes = list(body.disputes).map(dispute).filter(Boolean);
  const platformFeeRate = Math.max(0, number(policy.feeRate)) * 100;
  const taxRate = Math.max(0, number(policy.taxRate)) * 100;
  return Object.freeze({
    configured: true,
    enabled: policy.marketplaceEnabled !== false,
    crossCountryTradingEnabled: policy.crossCountryTradingEnabled !== false,
    moderationRequired: policy.moderationRequired === true,
    categories: Object.freeze(["All", ...new Set(listings.map((item) => item.category).filter(Boolean))]),
    volume: Math.max(0, number(summary.volume)), activeSellers: Math.max(0, integer(summary.activeSellers)),
    feeRate: platformFeeRate + taxRate, platformFeeRate, taxRate,
    listingDurationHours: Math.max(1, integer(policy.listingDurationHours, 168)),
    purchaseReservationMinutes: Math.max(1, integer(policy.purchaseReservationMinutes, 5)),
    disputeWindowDays: Math.max(1, integer(policy.disputeWindowDays, 7)),
    disputesEnabled: policy.disputesEnabled !== false,
    listings: Object.freeze(listings), myListings: Object.freeze(myListings), reservations: Object.freeze(reservations),
    orders: Object.freeze(orders), disputes: Object.freeze(disputes)
  });
}
