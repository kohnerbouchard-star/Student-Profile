import { ApiRequestError } from "./errors.js";

const LISTING = /^lst_[0-9a-f]{32}$/;
const ORDER = /^ord_[0-9a-f]{32}$/;
const IDEMPOTENCY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/;
const KEYS = new Set([
  "marketplace", "marketplaceListing", "marketplaceActivate",
  "marketplacePurchase", "marketplaceCancel", "marketplaceDispute"
]);

function requiredText(value, field, endpointKey) {
  const result = typeof value === "string" ? value.trim() : "";
  if (result) return result;
  throw new ApiRequestError(`${field} is required for ${endpointKey}.`, {
    body: { code: "player_route_context_missing", field, endpointKey }
  });
}
function publicKey(value, pattern, field, endpointKey) {
  const result = requiredText(value, field, endpointKey).toLowerCase();
  if (pattern.test(result)) return result;
  throw new ApiRequestError(`${field} is invalid for ${endpointKey}.`, {
    body: { code: "player_marketplace_public_id_invalid", field, endpointKey }
  });
}
function idempotency(payload, endpointKey) {
  const result = requiredText(payload?.idempotencyKey, "idempotencyKey", endpointKey);
  if (IDEMPOTENCY.test(result)) return result;
  throw new ApiRequestError(`idempotencyKey is invalid for ${endpointKey}.`, {
    body: { code: "player_marketplace_idempotency_invalid", endpointKey }
  });
}
function expectedVersion(payload, endpointKey) {
  const result = Number(payload?.expectedVersion);
  if (Number.isSafeInteger(result) && result >= 1) return result;
  throw new ApiRequestError(`expectedVersion is invalid for ${endpointKey}.`, {
    body: { code: "player_marketplace_version_invalid", endpointKey }
  });
}

export function hasMarketplaceBackendRoute(endpointKey) {
  return KEYS.has(endpointKey);
}

export function resolveMarketplaceBackendRequest({ endpointKey, payload = {}, params = {} }) {
  if (endpointKey === "marketplace") {
    return { endpointKey, method: "GET", path: "/players/me/marketplace/listings", payload: undefined };
  }
  if (endpointKey === "marketplaceListing") {
    return {
      endpointKey,
      method: "POST",
      path: "/players/me/marketplace/listings",
      payload: {
        itemKey: requiredText(payload.itemKey || payload.inventoryItemId, "itemKey", endpointKey).toLowerCase(),
        quantity: Number(payload.quantity),
        unitPrice: Number(payload.unitPrice),
        currencyCode: requiredText(payload.currencyCode, "currencyCode", endpointKey).toUpperCase(),
        condition: requiredText(payload.condition || "Used", "condition", endpointKey),
        durationHours: payload.durationHours === "" || payload.durationHours === undefined ? null : Number(payload.durationHours),
        idempotencyKey: idempotency(payload, endpointKey)
      }
    };
  }
  if (["marketplaceActivate", "marketplacePurchase", "marketplaceCancel"].includes(endpointKey)) {
    const listingId = publicKey(params.listingId || payload.listingId, LISTING, "listingId", endpointKey);
    const action = endpointKey === "marketplaceActivate" ? "activate" : endpointKey === "marketplacePurchase" ? "purchase" : "cancel";
    return {
      endpointKey,
      method: "POST",
      path: `/players/me/marketplace/listings/${encodeURIComponent(listingId)}/${action}`,
      payload: {
        ...(endpointKey === "marketplacePurchase" ? { quantity: Number(payload.quantity) } : {}),
        expectedVersion: expectedVersion(payload, endpointKey),
        idempotencyKey: idempotency(payload, endpointKey)
      }
    };
  }
  if (endpointKey === "marketplaceDispute") {
    const orderId = publicKey(params.orderId || payload.orderId || payload.orderKey, ORDER, "orderId", endpointKey);
    return {
      endpointKey,
      method: "POST",
      path: `/players/me/marketplace/orders/${encodeURIComponent(orderId)}/disputes`,
      payload: {
        reason: requiredText(payload.reason, "reason", endpointKey),
        idempotencyKey: idempotency(payload, endpointKey)
      }
    };
  }
  return null;
}
