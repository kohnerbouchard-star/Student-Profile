const REQUEST_ID_PATTERN = /^red_[0-9a-f]{32}$/;
const ITEM_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const QUEUE_STATUSES = new Set(["pending", "approved", "rejected", "fulfilled", "all"]);
const REVIEW_ACTIONS = new Set(["approve", "reject", "fulfill"]);

export class AdminInventoryRedemptionError extends Error {
  constructor(message, { status = 0, code = "inventory_redemption_request_failed", retryable = false } = {}) {
    super(message);
    this.name = "AdminInventoryRedemptionError";
    this.status = Number(status) || 0;
    this.code = String(code || "inventory_redemption_request_failed");
    this.retryable = retryable === true;
  }
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function invalid(message, response = false) {
  return new AdminInventoryRedemptionError(message, {
    code: response
      ? "invalid_inventory_redemption_response"
      : "invalid_inventory_redemption_request"
  });
}

function integer(value, {
  fallback,
  minimum,
  maximum,
  fieldName,
  response = false
}) {
  if (value === undefined || value === null || value === "") {
    if (fallback !== undefined) return fallback;
    throw invalid(`${fieldName} is invalid.`, response);
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw invalid(`${fieldName} is invalid.`, response);
  }
  return number;
}

function identifier(value, fieldName, pattern = null, response = false) {
  const result = text(value);
  if (!result || result.length > 160 || (pattern && !pattern.test(result))) {
    throw invalid(`${fieldName} is invalid.`, response);
  }
  return result;
}

function note(value, { required = false, response = false } = {}) {
  if (value === undefined || value === null) {
    if (required) throw invalid("A rejection reason is required.", response);
    return "";
  }
  if (typeof value !== "string") throw invalid("Review note must be a string.", response);
  const result = value.trim();
  if (result.length > 1000) throw invalid("Review note must not exceed 1000 characters.", response);
  if (required && !result) throw invalid("A rejection reason is required.", response);
  return result;
}

function isoTimestamp(value, fieldName, optional = false) {
  const source = text(value);
  if (!source && optional) return null;
  const timestamp = Date.parse(source);
  if (!Number.isFinite(timestamp)) {
    throw invalid(`Inventory redemption ${fieldName} is invalid.`, true);
  }
  return new Date(timestamp).toISOString();
}

function normalizeRedemption(value) {
  const source = record(value);
  const status = text(source.status).toLowerCase();
  if (!QUEUE_STATUSES.has(status) || status === "all") {
    throw invalid("Inventory redemption status is invalid.", true);
  }
  const player = record(source.player);
  const item = record(source.item);
  const itemId = identifier(source.itemId || item.id, "itemId", ITEM_ID_PATTERN, true);
  return Object.freeze({
    id: identifier(source.id, "requestId", REQUEST_ID_PATTERN, true),
    itemId,
    quantity: integer(source.quantity, {
      minimum: 1,
      maximum: 100,
      fieldName: "quantity",
      response: true
    }),
    status,
    requestNote: note(source.requestNote, { response: true }),
    resolutionNote: note(source.resolutionNote, { response: true }),
    requestedAt: isoTimestamp(source.requestedAt, "requestedAt"),
    reviewedAt: isoTimestamp(source.reviewedAt, "reviewedAt", true),
    fulfilledAt: isoTimestamp(source.fulfilledAt, "fulfilledAt", true),
    updatedAt: isoTimestamp(source.updatedAt, "updatedAt"),
    player: Object.freeze({
      reference: text(player.reference),
      displayName: text(player.displayName) || "Player",
      rosterLabel: text(player.rosterLabel)
    }),
    item: Object.freeze({
      id: identifier(item.id || itemId, "itemId", ITEM_ID_PATTERN, true),
      name: text(item.name) || "Item",
      category: text(item.category) || "general"
    })
  });
}

export function normalizeInventoryRedemptionQueueResponse(value) {
  const data = record(record(value).data);
  const rows = Array.isArray(data.redemptions)
    ? data.redemptions
    : Array.isArray(data.requests)
      ? data.requests
      : null;
  if (!rows || rows.length > 50) {
    throw invalid("Inventory redemption queue response is invalid.", true);
  }
  const redemptions = rows.map(normalizeRedemption);
  const pagination = record(data.pagination);
  const limit = integer(pagination.limit, {
    fallback: 25,
    minimum: 1,
    maximum: 50,
    fieldName: "limit",
    response: true
  });
  const offset = integer(pagination.offset, {
    fallback: 0,
    minimum: 0,
    maximum: 10000,
    fieldName: "offset",
    response: true
  });
  const returned = integer(pagination.returned, {
    fallback: redemptions.length,
    minimum: 0,
    maximum: limit,
    fieldName: "returned",
    response: true
  });
  if (returned !== redemptions.length) {
    throw invalid("Inventory redemption pagination is inconsistent.", true);
  }
  return Object.freeze({
    redemptions: Object.freeze(redemptions),
    summary: Object.freeze({
      returned: redemptions.length,
      pending: redemptions.filter((row) => row.status === "pending").length,
      approved: redemptions.filter((row) => row.status === "approved").length,
      rejected: redemptions.filter((row) => row.status === "rejected").length,
      fulfilled: redemptions.filter((row) => row.status === "fulfilled").length
    }),
    pagination: Object.freeze({
      limit,
      offset,
      returned,
      hasMore: pagination.hasMore === true
    }),
    status: text(record(data.filters).status).toLowerCase() || "all"
  });
}

async function json(response) {
  try {
    return record(await response.json());
  } catch {
    return {};
  }
}

function responseError(response, body) {
  return new AdminInventoryRedemptionError(
    text(body.message) || "Inventory redemption could not be completed.",
    {
      status: response.status,
      code: text(body.code) || "inventory_redemption_request_failed",
      retryable: body.retryable === true
    }
  );
}

export function createAdminInventoryRedemptionQueueClient({
  fetchImpl = globalThis.fetch,
  apiBase = "/api/admin"
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required.");
  const base = (text(apiBase) || "/api/admin").replace(/\/+$/, "");

  return Object.freeze({
    async list({ gameId, status = "pending", limit = 25, offset = 0, signal } = {}) {
      const selectedGameId = identifier(gameId, "gameId");
      const normalizedStatus = text(status).toLowerCase() || "pending";
      if (!QUEUE_STATUSES.has(normalizedStatus)) {
        throw invalid("Redemption status filter is invalid.");
      }
      const boundedLimit = integer(limit, {
        fallback: 25,
        minimum: 1,
        maximum: 50,
        fieldName: "limit"
      });
      const boundedOffset = integer(offset, {
        fallback: 0,
        minimum: 0,
        maximum: 10000,
        fieldName: "offset"
      });
      const query = new URLSearchParams({
        status: normalizedStatus,
        limit: String(boundedLimit),
        offset: String(boundedOffset)
      });
      const response = await fetchImpl(
        `${base}/games/${encodeURIComponent(selectedGameId)}/inventory/redemptions?${query}`,
        {
          method: "GET",
          headers: { accept: "application/json" },
          credentials: "same-origin",
          cache: "no-store",
          signal
        }
      );
      const body = await json(response);
      if (!response.ok) throw responseError(response, body);
      return normalizeInventoryRedemptionQueueResponse(body);
    },

    async review({ gameId, requestId, action, note: reviewNote = "", idempotencyKey, signal } = {}) {
      const selectedGameId = identifier(gameId, "gameId");
      const publicRequestId = identifier(requestId, "requestId", REQUEST_ID_PATTERN);
      const normalizedAction = text(action).toLowerCase();
      if (!REVIEW_ACTIONS.has(normalizedAction)) {
        throw invalid("Redemption review action is invalid.");
      }
      const normalizedNote = note(reviewNote, { required: normalizedAction === "reject" });
      const key = identifier(idempotencyKey, "idempotencyKey", IDEMPOTENCY_KEY_PATTERN);
      const response = await fetchImpl(
        `${base}/games/${encodeURIComponent(selectedGameId)}/inventory/redemptions/${encodeURIComponent(publicRequestId)}/${normalizedAction}`,
        {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            "x-idempotency-key": key,
            "x-request-id": key
          },
          body: JSON.stringify({ idempotencyKey: key, note: normalizedNote }),
          credentials: "same-origin",
          cache: "no-store",
          signal
        }
      );
      const body = await json(response);
      if (!response.ok) throw responseError(response, body);
      const data = record(body.data);
      const outcome = text(data.outcome).toLowerCase();
      if (!["applied", "replayed"].includes(outcome) || text(data.action).toLowerCase() !== normalizedAction) {
        throw invalid("Inventory redemption review response is invalid.", true);
      }
      const redemption = normalizeRedemption(data.redemption);
      if (redemption.id !== publicRequestId) {
        throw invalid("Inventory redemption review identity is inconsistent.", true);
      }
      return Object.freeze({ outcome, action: normalizedAction, redemption });
    }
  });
}
