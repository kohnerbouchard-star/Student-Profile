import { resolveBusinessBankingBackendRequest } from "./business-banking-backend-routes.js";
import { ApiRequestError } from "./errors.js";

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
    {
      body: { code: "player_notification_delivery_ids_invalid", endpointKey },
    },
  );
}

const ROUTE_BUILDERS = Object.freeze({
  session: () => ({ method: "GET", path: "/players/me" }),

  capabilities: () => ({
    method: "GET",
    path: "/players/me/capabilities",
  }),

  dashboard: ({ session }) => ({
    method: "GET",
    path: queryPath("/players/me/game/dashboard", {
      gameSessionId: requiredText(
        session?.gameSessionId,
        "gameSessionId",
        "dashboard",
      ),
    }),
  }),

  countries: () => ({
    method: "GET",
    path: "/players/me/world/countries",
  }),

  country: ({ params = {}, payload = {} }) => ({
    method: "GET",
    path: `/players/me/world/countries/${
      encodeURIComponent(requiredText(
        params.countryId || payload.countryId,
        "countryId",
        "country",
      ))
    }`,
  }),

  news: ({ payload = {} }) => ({
    method: "GET",
    path: queryPath("/players/me/world/news", {
      limit: payload.limit ?? 100,
      category: payload.category,
    }),
  }),

  portfolio: ({ payload = {} }) => ({
    method: "GET",
    path: queryPath("/players/me/stocks/portfolio", {
      limit: payload.limit,
    }),
  }),

  market: ({ payload = {} }) => ({
    method: "GET",
    path: queryPath("/players/me/stocks/assets", {
      limit: payload.limit ?? 100,
      offset: payload.offset ?? 0,
    }),
  }),

  marketAsset: ({ params = {}, payload = {} }) => ({
    method: "GET",
    path: queryPath(
      `/players/me/stocks/assets/${
        encodeURIComponent(requiredText(
          params.assetId || payload.assetId,
          "assetId",
          "marketAsset",
        ))
      }`,
      {
        historyLimit: payload.historyLimit ?? 200,
      },
    ),
  }),

  marketOrder: ({ payload = {} }) => {
    if (String(payload.orderType || "market").toLowerCase() !== "market") {
      throw new ApiRequestError(
        "Limit orders are not supported by the current player stock-order route.",
        { body: { code: "player_limit_orders_not_supported" } },
      );
    }
    const expectedPrice = Number(payload.expectedPrice ?? payload.price);
    if (!Number.isFinite(expectedPrice) || expectedPrice <= 0) {
      throw new ApiRequestError(
        "expectedPrice is required for marketOrder.",
        { body: { code: "player_market_expected_price_invalid" } },
      );
    }
    return {
      method: "POST",
      path: "/players/me/stocks/orders",
      payload: {
        ticker: requiredText(
          payload.ticker || payload.symbol || payload.assetId,
          "ticker",
          "marketOrder",
        ).toUpperCase(),
        expectedPrice,
        side: requiredText(payload.side, "side", "marketOrder").toLowerCase(),
        quantity: Number(payload.quantity),
        idempotencyKey: idempotencyKey(payload, "marketOrder"),
      },
    };
  },

  marketWatchlist: ({ params = {}, payload = {} }) => {
    if (typeof payload.enabled !== "boolean") {
      throw new ApiRequestError(
        "enabled must be a boolean for marketWatchlist.",
        {
          body: {
            code: "player_watchlist_state_invalid",
            endpointKey: "marketWatchlist",
          },
        },
      );
    }
    return {
      method: payload.enabled ? "PUT" : "DELETE",
      path: `/players/me/stocks/watchlist/${
        encodeURIComponent(requiredText(
          params.assetId || payload.assetId,
          "assetId",
          "marketWatchlist",
        ))
      }`,
    };
  },

  store: () => ({ method: "GET", path: "/players/me/store/items" }),

  storeQuote: ({ payload = {} }) => ({
    method: "POST",
    path: "/players/me/store/quotes",
    payload: {
      itemKey: requiredText(payload.itemKey, "itemKey", "storeQuote"),
      quantity: Number(payload.quantity ?? 1),
    },
  }),

  storePurchase: ({ payload = {} }) => ({
    method: "POST",
    path: "/players/me/store/purchases",
    payload: {
      quoteKey: requiredText(payload.quoteKey, "quoteKey", "storePurchase"),
      idempotencyKey: idempotencyKey(payload, "storePurchase"),
      clientSubmittedAt: typeof payload.clientSubmittedAt === "string"
        ? payload.clientSubmittedAt
        : null,
    },
  }),

  inventory: () => ({ method: "GET", path: "/players/me/inventory" }),

  inventoryUse: ({ path, params = {}, payload = {} }) => ({
    method: "POST",
    path: `/players/me/inventory/${
      encodeURIComponent(requiredText(
        params.inventoryItemId ||
          params.itemId ||
          payload.itemId ||
          resolvedPathValue(path, /^\/inventory\/([^/]+)\/redemptions$/),
        "itemId",
        "inventoryUse",
      ))
    }/redemptions`,
    payload: {
      quantity: Number(payload.quantity ?? 1),
      note: typeof payload.note === "string" ? payload.note.trim() : "",
      idempotencyKey: idempotencyKey(payload, "inventoryUse"),
    },
  }),

  banking: ({ payload = {} }) => ({
    method: "GET",
    path: queryPath("/players/me/ledger", {
      limit: payload.limit ?? 50,
      cursor: payload.cursor,
    }),
  }),

  contracts: () => ({
    method: "GET",
    path: "/players/me/contracts",
  }),

  contractAccept: ({ path, params = {}, payload = {} }) => ({
    method: "POST",
    path: `/players/me/contracts/${
      encodeURIComponent(requiredText(
        params.contractKey ||
          params.contractId ||
          payload.contractKey ||
          payload.contractId ||
          resolvedPathValue(path, /^\/contracts\/([^/]+)\/accept$/),
        "contractKey",
        "contractAccept",
      ))
    }/accept`,
  }),

  contractSubmit: ({ path, params = {}, payload = {} }) => ({
    method: "POST",
    path: `/players/me/contracts/${
      encodeURIComponent(requiredText(
        params.contractKey ||
          params.contractId ||
          payload.contractKey ||
          payload.contractId ||
          resolvedPathValue(path, /^\/contracts\/([^/]+)\/submissions?$/),
        "contractKey",
        "contractSubmit",
      ))
    }/submit`,
    payload: {
      evidencePayload: payload.evidencePayload &&
          typeof payload.evidencePayload === "object" &&
          !Array.isArray(payload.evidencePayload)
        ? payload.evidencePayload
        : {
          submissionUrl: typeof payload.submissionUrl === "string"
            ? payload.submissionUrl.trim()
            : "",
          note: typeof payload.note === "string" ? payload.note.trim() : "",
        },
    },
  }),
  notifications: ({ payload = {} }) => ({
    method: "GET",
    path: queryPath("/players/me/notifications", {
      status: payload.status ?? "unread",
      limit: payload.limit ?? 50,
      cursor: payload.cursor,
    }),
  }),

  notificationsPage: ({ payload = {} }) => ({
    method: "GET",
    path: queryPath("/players/me/notifications", {
      status: payload.status ?? "unread",
      limit: payload.limit ?? 20,
      cursor: payload.cursor,
    }),
  }),

  notificationsRead: ({ payload = {} }) => ({
    method: "POST",
    path: "/players/me/notifications/read",
    payload: {
      deliveryIds: notificationDeliveryIds(payload, "notificationsRead"),
    },
  }),

  storyDeliveries: () => ({
    method: "GET",
    path: "/players/me/story-deliveries",
  }),

  storyDeliveryState: ({ params = {}, payload = {} }) => ({
    method: "POST",
    path: `/players/me/story-deliveries/${encodeURIComponent(
      publicStoryDeliveryId(params.deliveryId || payload.deliveryId),
    )}/state`,
    payload: {
      action: storyDeliveryAction(payload.action),
    },
  }),

  logout: () => ({ method: "POST", path: "/players/me/session/logout" }),
});

const CORE_PLAYER_BACKEND_ROUTE_KEYS = Object.freeze(Object.keys(ROUTE_BUILDERS));
const BUSINESS_BANKING_ROUTE_KEYS = Object.freeze([
  "business",
  "businessCreate",
  "businessProductCreate",
  "businessInputPurchase",
  "businessProduction",
  "businessPrice",
  "businessHire",
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

export function resolvePlayerBackendRequest(
  { endpointKey, method, path, payload, params, session },
) {
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
  const resolved = builder({
    endpointKey,
    method,
    path,
    payload,
    params,
    session,
  });
  return {
    endpointKey,
    method: resolved.method,
    path: resolved.path,
    payload: Object.hasOwn(resolved, "payload") ? resolved.payload : undefined,
    provisional: { method, path, payload },
  };
}
