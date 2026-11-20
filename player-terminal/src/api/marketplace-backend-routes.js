import { ApiRequestError } from "./errors.js";

const LISTING = /^lst_[0-9a-f]{32}$/;
const RESERVATION = /^mpr_[0-9a-f]{32}$/;
const ORDER = /^ord_[0-9a-f]{32}$/;
const ACCOUNT = /^bac_[0-9a-f]{32}$/;
const IDEMPOTENCY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/;
const KEYS = new Set([
  "marketplace", "marketplaceListing", "marketplaceActivate",
  "marketplacePurchase", "marketplaceSettlement", "marketplaceCancel",
  "marketplaceDispute"
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
function allocations(payload, endpointKey) {
  const source = payload?.allocations;
  if (!Array.isArray(source) || source.length < 1 || source.length > 3) {
    throw new ApiRequestError(`allocations is invalid for ${endpointKey}.`, {
      body: { code: "player_marketplace_allocations_invalid", endpointKey }
    });
  }
  const seen = new Set();
  return source.map((entry) => {
    const accountKey = String(entry?.sourceAccountKey || "").trim().toLowerCase();
    const targetAmount = Number(entry?.targetAmount);
    if (!ACCOUNT.test(accountKey) || seen.has(accountKey) || !Number.isFinite(targetAmount) || targetAmount <= 0) {
      throw new ApiRequestError(`allocations is invalid for ${endpointKey}.`, {
        body: { code: "player_marketplace_allocations_invalid", endpointKey }
      });
    }
    seen.add(accountKey);
    return { sourceAccountKey: accountKey, targetAmount };
  });
}
function clientSubmittedAt(value, endpointKey) {
  if (value === null || value === undefined || value === "") return null;
  const result = String(value).trim();
  if (!Number.isFinite(Date.parse(result))) {
    throw new ApiRequestError(`clientSubmittedAt is invalid for ${endpointKey}.`, {
      body: { code: "player_marketplace_timestamp_invalid", endpointKey }
    });
  }
  return new Date(result).toISOString();
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
  if (["marketplaceActivate", "marketplaceCancel"].includes(endpointKey)) {
    const listingId = publicKey(params.listingId || payload.listingId, LISTING, "listingId", endpointKey);
    const action = endpointKey === "marketplaceActivate" ? "activate" : "cancel";
    return {
      endpointKey,
      method: "POST",
      path: `/players/me/marketplace/listings/${encodeURIComponent(listingId)}/${action}`,
      payload: {
        expectedVersion: expectedVersion(payload, endpointKey),
        idempotencyKey: idempotency(payload, endpointKey)
      }
    };
  }
  if (endpointKey === "marketplacePurchase") {
    const listingId = publicKey(params.listingId || payload.listingId, LISTING, "listingId", endpointKey);
    return {
      endpointKey,
      method: "POST",
      path: `/players/me/marketplace/listings/${encodeURIComponent(listingId)}/quotes`,
      payload: {
        quantity: Number(payload.quantity),
        expectedVersion: expectedVersion(payload, endpointKey),
        allocations: allocations(payload, endpointKey),
        idempotencyKey: idempotency(payload, endpointKey)
      }
    };
  }
  if (endpointKey === "marketplaceSettlement") {
    const reservationId = publicKey(
      params.reservationId || payload.reservationId || payload.reservationKey,
      RESERVATION,
      "reservationId",
      endpointKey
    );
    return {
      endpointKey,
      method: "POST",
      path: `/players/me/marketplace/reservations/${encodeURIComponent(reservationId)}/settlements`,
      payload: {
        idempotencyKey: idempotency(payload, endpointKey),
        clientSubmittedAt: clientSubmittedAt(payload.clientSubmittedAt, endpointKey)
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
