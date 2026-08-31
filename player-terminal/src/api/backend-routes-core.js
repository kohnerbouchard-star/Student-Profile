import { resolveBusinessBankingBackendRequest } from "./business-banking-backend-routes.js";
import { ApiRequestError } from "./errors.js";
import { BUSINESS_TREASURY_ROUTE_BUILDERS } from "./business-treasury-backend-routes.js";

function requiredText(value, fieldName, endpointKey) {
  const text = typeof value === "string" ? value.trim() : "";
  if (text) return text;
  throw new ApiRequestError(`${fieldName} is required for ${endpointKey}.`, {
    body: { code: "player_route_context_missing", fieldName, endpointKey },
  });
}
function publicStoryDeliveryId(value) {
  const deliveryId = requiredText(value, "deliveryId", "storyDeliveryState").toLowerCase();
  if (/^ndl_[0-9a-f]{32}$/.test(deliveryId)) return deliveryId;
  throw new ApiRequestError("deliveryId is invalid for storyDeliveryState.", {
    body: { code: "player_story_delivery_id_invalid", endpointKey: "storyDeliveryState" },
  });
}

function storyDeliveryAction(value) {
  const action = requiredText(value, "action", "storyDeliveryState").toLowerCase();
  if (["seen", "dismissed", "acknowledged"].includes(action)) return action;
  throw new ApiRequestError("action is invalid for storyDeliveryState.", {
    body: { code: "player_story_delivery_action_invalid", endpointKey: "storyDeliveryState" },
  });
}

function resolvedPathValue(path, pattern) {
  const match = String(path || "").match(pattern);
  if (!match?.[1]) return "";
  try {
    return decodeURIComponent(match[1]).trim();
  } catch {
    return "";
  }
}

function queryPath(path, values) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && String(value).trim()) {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

function idempotencyKey(payload, endpointKey) {
  return requiredText(payload?.idempotencyKey, "idempotencyKey", endpointKey);
}

function requiredPublicKey(value, pattern, fieldName, endpointKey) {
  const candidate = requiredText(value, fieldName, endpointKey).toLowerCase();
  if (pattern.test(candidate)) return candidate;
  throw new ApiRequestError(`${fieldName} is invalid for ${endpointKey}.`, {
    body: { code: "player_public_key_invalid", fieldName, endpointKey },
  });
}

function requiredPositiveInteger(value, fieldName, endpointKey) {
  const candidate = Number(value);
  if (Number.isSafeInteger(candidate) && candidate >= 1 && candidate <= 1_000_000) {
    return candidate;
  }
  throw new ApiRequestError(`${fieldName} is invalid for ${endpointKey}.`, {
    body: { code: "player_positive_integer_invalid", fieldName, endpointKey },
  });
}

function requiredStoreFundingAmount(value, fieldName, endpointKey) {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (
    /^(?:0|[1-9][0-9]{0,19})(?:\.[0-9]{1,18})?$/u.test(candidate) &&
    /[1-9]/u.test(candidate)
  ) {
    const [whole, fraction = ""] = candidate.split(".");
    const canonicalFraction = fraction.replace(/0+$/u, "");
    return canonicalFraction ? `${whole}.${canonicalFraction}` : whole;
  }
  throw new ApiRequestError(`${fieldName} is invalid for ${endpointKey}.`, {
    body: {
      code: "player_store_funding_amount_invalid",
      fieldName,
      endpointKey,
    },
  });
}

function requiredStoreFundingAllocations(value, endpointKey) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) {
    throw new ApiRequestError(`allocations is invalid for ${endpointKey}.`, {
      body: {
        code: "player_store_funding_allocations_invalid",
        fieldName: "allocations",
        endpointKey,
      },
    });
  }
  const accountKeys = new Set();
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new ApiRequestError(`allocations[${index}] is invalid for ${endpointKey}.`, {
        body: {
          code: "player_store_funding_allocation_invalid",
          fieldName: `allocations[${index}]`,
          endpointKey,
        },
      });
    }
    const sourceAccountKey = requiredPublicKey(
      entry.sourceAccountKey,
      /^bac_[0-9a-f]{32}$/u,
      `allocations[${index}].sourceAccountKey`,
      endpointKey,
    );
    if (accountKeys.has(sourceAccountKey)) {
      throw new ApiRequestError(`allocations is invalid for ${endpointKey}.`, {
        body: {
          code: "player_store_funding_accounts_duplicate",
          fieldName: "allocations",
          endpointKey,
        },
      });
    }
    accountKeys.add(sourceAccountKey);
    const finalAllocation = index === value.length - 1;
    if (finalAllocation && entry.targetAmount !== null) {
      throw new ApiRequestError(`allocations[${index}] is invalid for ${endpointKey}.`, {
        body: {
          code: "player_store_funding_remainder_invalid",
          fieldName: `allocations[${index}].targetAmount`,
          endpointKey,
        },
      });
    }
    if (!finalAllocation && entry.targetAmount === null) {
      throw new ApiRequestError(`allocations[${index}] is invalid for ${endpointKey}.`, {
        body: {
          code: "player_store_funding_fixed_amount_invalid",
          fieldName: `allocations[${index}].targetAmount`,
          endpointKey,
        },
      });
    }
    return {
      sourceAccountKey,
      targetAmount: finalAllocation
        ? null
        : requiredStoreFundingAmount(
          entry.targetAmount,
          `allocations[${index}].targetAmount`,
          endpointKey,
        ),
    };
  });
}

function gameSessionId(payload, session, endpointKey) {
  return requiredText(
    payload?.gameSessionId || session?.gameSessionId,
    "gameSessionId",
    endpointKey,
  );
}

function notificationDeliveryIds(payload, endpointKey) {
  const rawIds = Array.isArray(payload?.deliveryIds)
    ? payload.deliveryIds
    : Array.isArray(payload?.notificationIds)
    ? payload.notificationIds
    : [];
  const deliveryIds = [
    ...new Set(
      rawIds.map((value) =>
        typeof value === "string" ? value.trim().toLowerCase() : ""
      ).filter(Boolean),
    ),
  ];
  if (deliveryIds.length >= 1 && deliveryIds.length <= 50) return deliveryIds;
  throw new ApiRequestError(
    "Provide between 1 and 50 notification delivery IDs.",
    { body: { code: "player_notification_delivery_ids_invalid", endpointKey } },
  );
}

const ROUTE_BUILDERS = Object.freeze({
  ...BUSINESS_TREASURY_ROUTE_BUILDERS,
  session: () => ({ method: "GET", path: "/players/me" }),
  capabilities: () => ({ method: "GET", path: "/players/me/capabilities" }),
  dashboard: () => ({
    method: "GET",
    path: "/players/me/game/dashboard",
  }),
  countries: () => ({ method: "GET", path: "/players/me/world/countries" }),
  country: ({ params = {}, payload = {} }) => ({
    method: "GET",
    path: `/players/me/world/countries/${encodeURIComponent(requiredText(params.countryId || payload.countryId, "countryId", "country"))}`,
  }),
  news: ({ payload = {} }) => ({
    method: "GET",
    path: queryPath("/players/me/world/news", { limit: payload.limit ?? 50, category: payload.category }),
  }),
  worldRuntime: () => ({ method: "GET", path: "/players/me/world-runtime" }),
  arrivalClass: ({ payload = {} }) => ({
    method: "POST",
    path: "/players/me/arrival-class",
    payload: { answers: payload.answers },
  }),
  travelQuote: ({ payload = {} }) => ({
    method: "POST",
    path: "/players/me/travel/quotes",
    payload: { toLocationId: payload.toLocationId, allowedModes: payload.allowedModes },
  }),
  travelExecute: ({ payload = {} }) => ({
    method: "POST",
    path: "/players/me/travel",
    payload: { quoteId: payload.quoteId },
  }),
  travelComplete: ({ params = {}, payload = {} }) => ({
    method: "POST",
    path: `/players/me/travel/${encodeURIComponent(requiredText(params.journeyId || payload.journeyId, "journeyId", "travelComplete"))}/complete`,
    payload: {},
  }),
  residencyRequest: ({ payload = {} }) => ({
    method: "POST",
    path: "/players/me/residency",
    payload: { countryId: payload.countryId, expectedRevision: payload.expectedRevision },
  }),
  portfolio: ({ payload = {} }) => ({
    method: "GET",
    path: queryPath("/players/me/stocks/portfolio", { limit: payload.limit }),
  }),
  market: ({ payload = {} }) => ({
    method: "GET",
    path: queryPath("/players/me/stocks/assets", { limit: payload.limit ?? 100, offset: payload.offset ?? 0 }),
  }),
  marketAsset: ({ params = {}, payload = {} }) => ({
    method: "GET",
    path: queryPath(`/players/me/stocks/assets/${encodeURIComponent(requiredText(params.assetId || payload.assetId, "assetId", "marketAsset"))}`, { historyLimit: payload.historyLimit ?? 200 }),
  }),
  marketOrder: ({ payload = {} }) => {
    const endpointKey = "marketOrder";
    const action = requiredText(payload.action, "action", endpointKey).toLowerCase();
    const requestIdempotencyKey = idempotencyKey(payload, endpointKey);
    if (action === "settle_buy_quote") {
      return {
        method: "POST",
        path: "/players/me/stocks/orders",
        payload: {
          action,
          quoteKey: requiredPublicKey(payload.quoteKey, /^sbq_[0-9a-f]{32}$/, "quoteKey", endpointKey),
          idempotencyKey: requestIdempotencyKey,
        },
      };
    }

    const ticker = requiredText(payload.ticker, "ticker", endpointKey).toUpperCase();
    const quantity = Number(payload.quantity);
    const expectedPrice = Number(payload.expectedPrice);
    const expectedTickIndex = Number(payload.expectedTickIndex);
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(expectedPrice) || expectedPrice <= 0 || !Number.isSafeInteger(expectedTickIndex) || expectedTickIndex < 0) {
      throw new ApiRequestError("Stock quote and settlement evidence is invalid.", {
        body: { code: "player_market_evidence_invalid", endpointKey },
      });
    }
    if (action === "create_buy_quote" || action === "buy_now") {
      const allocations = Array.isArray(payload.allocations)
        ? payload.allocations.map((row, index) => ({
          sourceAccountKey: requiredPublicKey(
            row?.sourceAccountKey,
            /^bac_[0-9a-f]{32}$/,
            `allocations[${index}].sourceAccountKey`,
            endpointKey,
          ),
          targetAmount: Number(row?.targetAmount),
        }))
        : [];
      if (allocations.length < 1 || allocations.length > 3 || allocations.some((row) => !Number.isFinite(row.targetAmount) || row.targetAmount <= 0)) {
        throw new ApiRequestError("Stock funding requires one to three positive Checking allocations.", {
          body: { code: "player_market_allocations_invalid", endpointKey },
        });
      }
      return {
        method: "POST",
        path: "/players/me/stocks/orders",
        payload: {
          action,
          ticker,
          quantity,
          expectedPrice,
          expectedTickIndex,
          allocations,
          idempotencyKey: requestIdempotencyKey,
        },
      };
    }
    if (action === "settle_sell") {
      return {
        method: "POST",
        path: "/players/me/stocks/orders",
        payload: {
          action,
          ticker,
          quantity,
          expectedPrice,
          expectedTickIndex,
          destinationAccountKey: requiredPublicKey(
            payload.destinationAccountKey,
            /^bac_[0-9a-f]{32}$/,
            "destinationAccountKey",
            endpointKey,
          ),
          idempotencyKey: requestIdempotencyKey,
        },
      };
    }
    throw new ApiRequestError("The requested Stock trading action is not supported.", {
      body: { code: "player_market_action_invalid", endpointKey },
    });
  },

  marketWatchlist: ({ params = {}, payload = {} }) => {
    if (typeof payload.enabled !== "boolean") {
      throw new ApiRequestError("enabled must be a boolean for marketWatchlist.", { body: { code: "player_watchlist_state_invalid", endpointKey: "marketWatchlist" } });
    }
    return {
      method: payload.enabled ? "PUT" : "DELETE",
      path: `/players/me/stocks/watchlist/${encodeURIComponent(requiredText(params.assetId || payload.assetId, "assetId", "marketWatchlist"))}`,
    };
  },
  store: () => ({ method: "GET", path: "/players/me/store/items" }),
  storeQuote: ({ payload = {} }) => ({
    method: "POST",
    path: "/players/me/store/quotes",
    payload: {
      offerKey: requiredPublicKey(payload.offerKey, /^sof_[0-9a-f]{32}$/u, "offerKey", "storeQuote"),
      quantity: requiredPositiveInteger(payload.quantity, "quantity", "storeQuote"),
      expectedVersion: requiredPositiveInteger(payload.expectedVersion, "expectedVersion", "storeQuote"),
      allocations: requiredStoreFundingAllocations(payload.allocations, "storeQuote"),
      idempotencyKey: idempotencyKey(payload, "storeQuote"),
    },
  }),
  storePurchase: ({ payload = {} }) => ({
    method: "POST",
    path: "/players/me/store/purchases",
    payload: {
      quoteKey: requiredText(payload.quoteKey, "quoteKey", "storePurchase"),
      idempotencyKey: idempotencyKey(payload, "storePurchase"),
    },
  }),
  storeOfferQuote: ({ payload = {} }) => ({
    method: "POST",
    path: "/players/me/store/offer-quotes",
    payload: {
      offerKey: requiredPublicKey(payload.offerKey, /^sof_[0-9a-f]{32}$/u, "offerKey", "storeOfferQuote"),
      quantity: requiredPositiveInteger(payload.quantity, "quantity", "storeOfferQuote"),
      expectedVersion: requiredPositiveInteger(payload.expectedVersion, "expectedVersion", "storeOfferQuote"),
      allocations: requiredStoreFundingAllocations(payload.allocations, "storeOfferQuote"),
      idempotencyKey: idempotencyKey(payload, "storeOfferQuote"),
    },
  }),
  storeOfferPurchase: ({ payload = {} }) => ({
    method: "POST",
    path: "/players/me/store/offer-purchases",
    payload: {
      quoteKey: requiredPublicKey(payload.quoteKey, /^quote_[0-9a-f]{32}$/u, "quoteKey", "storeOfferPurchase"),
      idempotencyKey: idempotencyKey(payload, "storeOfferPurchase"),
    },
  }),
  storeOfferReceipt: ({ path, params = {}, payload = {} }) => {
    const receiptKey = requiredPublicKey(
      params.receiptKey || payload.receiptKey || resolvedPathValue(path, /^\/store\/receipts\/([^/]+)$/),
      /^spr_[0-9a-f]{32}$/u,
      "receiptKey",
      "storeOfferReceipt",
    );
    return {
      method: "GET",
      path: `/players/me/store/receipts/${encodeURIComponent(receiptKey)}`,
    };
  },
  inventory: () => ({ method: "GET", path: "/players/me/inventory" }),
  inventoryUse: ({ path, params = {}, payload = {} }) => ({
    method: "POST",
    path: `/players/me/inventory/${encodeURIComponent(requiredText(params.inventoryItemId || params.itemId || payload.itemId || resolvedPathValue(path, /^\/inventory\/([^/]+)\/redemptions$/), "itemId", "inventoryUse"))}/redemptions`,
    payload: { quantity: Number(payload.quantity ?? 1), note: typeof payload.note === "string" ? payload.note.trim() : "", idempotencyKey: idempotencyKey(payload, "inventoryUse") },
  }),
  banking: ({ payload = {} }) => ({
    method: "GET",
    path: queryPath("/players/me/ledger", { limit: payload.limit ?? 50, cursor: payload.cursor }),
  }),
  contracts: () => ({ method: "GET", path: "/players/me/contracts" }),
  contractAccept: ({ path, params = {}, payload = {} }) => ({
    method: "POST",
    path: `/players/me/contracts/${encodeURIComponent(requiredText(params.contractKey || params.contractId || payload.contractKey || payload.contractId || resolvedPathValue(path, /^\/contracts\/([^/]+)\/accept$/), "contractKey", "contractAccept"))}/accept`,
  }),
  contractSubmit: ({ path, params = {}, payload = {} }) => ({
    method: "POST",
    path: `/players/me/contracts/${encodeURIComponent(requiredText(params.contractKey || params.contractId || payload.contractKey || payload.contractId || resolvedPathValue(path, /^\/contracts\/([^/]+)\/submissions?$/), "contractKey", "contractSubmit"))}/submit`,
    payload: {
      evidencePayload: payload.evidencePayload && typeof payload.evidencePayload === "object" && !Array.isArray(payload.evidencePayload)
        ? payload.evidencePayload
        : { submissionUrl: typeof payload.submissionUrl === "string" ? payload.submissionUrl.trim() : "", note: typeof payload.note === "string" ? payload.note.trim() : "" },
    },
  }),
  notifications: ({ payload = {} }) => ({
    method: "GET",
    path: queryPath("/players/me/notifications", { status: payload.status ?? "unread", limit: payload.limit ?? 50, cursor: payload.cursor }),
  }),
  notificationsPage: ({ payload = {} }) => ({
    method: "GET",
    path: queryPath("/players/me/notifications", { status: payload.status ?? "unread", limit: payload.limit ?? 20, cursor: payload.cursor }),
  }),
  notificationsRead: ({ payload = {} }) => ({
    method: "POST",
    path: "/players/me/notifications/read",
    payload: { deliveryIds: notificationDeliveryIds(payload, "notificationsRead") },
  }),
  storyDeliveries: () => ({ method: "GET", path: "/players/me/story-deliveries" }),
  storyDeliveryState: ({ params = {}, payload = {} }) => ({
    method: "POST",
    path: `/players/me/story-deliveries/${encodeURIComponent(publicStoryDeliveryId(params.deliveryId || payload.deliveryId))}/state`,
    payload: { action: storyDeliveryAction(payload.action) },
  }),
  logout: () => ({ method: "POST", path: "/players/me/session/logout" }),
});

const CORE_PLAYER_BACKEND_ROUTE_KEYS = Object.freeze(Object.keys(ROUTE_BUILDERS));
const BUSINESS_BANKING_ROUTE_KEYS = Object.freeze([
  "business",
  "businessWorkforce",
  "businessCreate",
  "businessProductCreate",
  "businessProduction",
  "businessPrice",
  "businessCandidateHire",
  "businessTerminate",
  "businessStatus",
  "bankTransfer",
  "savingsTransfer",
  "loans",
  "loanApply",
  "loanRepay",
]);

export const PLAYER_BACKEND_ROUTE_KEYS = Object.freeze([
  ...CORE_PLAYER_BACKEND_ROUTE_KEYS,
  ...BUSINESS_BANKING_ROUTE_KEYS,
]);

export function hasPlayerBackendRoute(endpointKey) {
  return Object.hasOwn(ROUTE_BUILDERS, endpointKey) ||
    BUSINESS_BANKING_ROUTE_KEYS.includes(endpointKey);
}

export function resolvePlayerBackendRequest({ endpointKey, method, path, payload, params, session }) {
  const builder = ROUTE_BUILDERS[endpointKey];
  if (!builder) {
    return resolveBusinessBankingBackendRequest({
      endpointKey,
      method,
      path,
      payload,
      params,
      session,
    });
  }
  const resolved = builder({ endpointKey, method, path, payload, params, session });
  return {
    endpointKey,
    method: resolved.method,
    path: resolved.path,
    payload: Object.hasOwn(resolved, "payload") ? resolved.payload : undefined,
    provisional: { method, path, payload },
  };
}
