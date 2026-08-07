const REQUEST_ID_PATTERN = /^red_[0-9a-f]{32}$/;
const UUID_IN_TEXT_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;
const STATUSES = new Set(["pending", "approved", "rejected", "fulfilled"]);
const FILTER_STATUSES = new Set([...STATUSES, "all"]);

export function safeInventoryText(value, maximum = 1000, fallback = "") {
  if (!["string", "number", "boolean"].includes(typeof value)) return fallback;
  const normalized = String(value ?? "").trim().replace(UUID_IN_TEXT_PATTERN, "[redacted]");
  return (normalized || fallback).slice(0, maximum);
}

export function safeInventoryRequestId(value) {
  const requestId = String(value || "").trim().toLowerCase();
  return REQUEST_ID_PATTERN.test(requestId) ? requestId : "";
}

function safeTimestamp(value) {
  const source = safeInventoryText(value, 80);
  const timestamp = Date.parse(source);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
}

export function normalizeInventoryRedemption(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const requestId = safeInventoryRequestId(row.id || row.requestId);
  const status = safeInventoryText(row.status, 24).toLowerCase();
  const quantity = Number(row.quantity);
  if (!requestId || !STATUSES.has(status) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100) {
    return null;
  }

  const player = row.player && typeof row.player === "object" && !Array.isArray(row.player)
    ? row.player
    : {};
  const item = row.item && typeof row.item === "object" && !Array.isArray(row.item)
    ? row.item
    : {};
  return Object.freeze({
    rowKey: requestId,
    requestId,
    quantity,
    status,
    requestNote: safeInventoryText(row.requestNote, 1000),
    resolutionNote: safeInventoryText(row.resolutionNote, 1000),
    requestedAt: safeTimestamp(row.requestedAt),
    reviewedAt: safeTimestamp(row.reviewedAt),
    fulfilledAt: safeTimestamp(row.fulfilledAt),
    updatedAt: safeTimestamp(row.updatedAt),
    player: Object.freeze({
      displayName: safeInventoryText(player.displayName, 240, "Player"),
      reference: safeInventoryText(player.reference, 160),
      rosterLabel: safeInventoryText(player.rosterLabel, 160),
    }),
    item: Object.freeze({
      name: safeInventoryText(item.name, 240, "Item"),
      category: safeInventoryText(item.category, 120, "general"),
      provenance: safeInventoryText(item.provenance || item.origin, 80),
      type: safeInventoryText(item.type || item.itemType, 80),
    }),
  });
}

export function summarizeInventoryRedemptions(redemptions) {
  return Object.freeze({
    returned: redemptions.length,
    pending: redemptions.filter((row) => row.status === "pending").length,
    approved: redemptions.filter((row) => row.status === "approved").length,
    rejected: redemptions.filter((row) => row.status === "rejected").length,
    fulfilled: redemptions.filter((row) => row.status === "fulfilled").length,
  });
}

function normalizePagination(value, returned) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const limit = Number(source.limit);
  const offset = Number(source.offset);
  return Object.freeze({
    limit: Number.isSafeInteger(limit) && limit > 0 && limit <= 50 ? limit : 25,
    offset: Number.isSafeInteger(offset) && offset >= 0 ? offset : 0,
    returned,
    hasMore: source.hasMore === true,
  });
}

/**
 * Normalizes only the authoritative Admin redemption projection. The model does
 * not invent a player inventory ledger, owned balance, business relation, or
 * seeded/custom provenance when the contract does not expose those fields.
 */
export function normalizeInventoryReadModel(queue) {
  const rows = Array.isArray(queue?.redemptions) ? queue.redemptions : [];
  const redemptions = Object.freeze(rows.map(normalizeInventoryRedemption).filter(Boolean));
  const status = FILTER_STATUSES.has(String(queue?.status || "").toLowerCase())
    ? String(queue.status).toLowerCase()
    : "all";
  return Object.freeze({
    redemptions,
    summary: summarizeInventoryRedemptions(redemptions),
    pagination: normalizePagination(queue?.pagination, redemptions.length),
    status,
    isEmpty: redemptions.length === 0,
    contract: Object.freeze({
      exposesOwnedBalanceDirectory: false,
      exposesBusinessRelationship: false,
      exposesProvenance: redemptions.some((row) => Boolean(row.item.provenance)),
      exposesType: redemptions.some((row) => Boolean(row.item.type)),
    }),
  });
}
