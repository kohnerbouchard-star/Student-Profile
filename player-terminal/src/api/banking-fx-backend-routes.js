import { ApiRequestError } from "./errors.js";

const ACCOUNT_KEY = /^bac_[0-9a-f]{32}$/u;
const QUOTE_KEY = /^fxq_[0-9a-f]{32}$/u;
const ORDER_KEY = /^fxo_[0-9a-f]{32}$/u;
const CURRENCY_CODE = /^[A-Z]{3}$/u;
const DECIMAL_AMOUNT = /^(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{1,18})?$/u;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/u;
const HISTORY_RANGES = new Set(["7d", "30d", "game"]);
const ORDER_STATUSES = new Set(["pending", "completed", "all"]);
const PRODUCTS = new Set(["standard", "instant"]);

function requiredText(value, fieldName, endpointKey) {
  const result = typeof value === "string" ? value.trim() : "";
  if (result) return result;
  throw new ApiRequestError(`${fieldName} is required for ${endpointKey}.`, {
    code: "INVALID_REQUEST",
    endpointKey,
  });
}

function publicKey(value, pattern, fieldName, endpointKey) {
  const result = requiredText(value, fieldName, endpointKey).toLowerCase();
  if (pattern.test(result)) return result;
  throw new ApiRequestError(`${fieldName} is invalid for ${endpointKey}.`, {
    code: "INVALID_REQUEST",
    endpointKey,
  });
}

function currencyCode(value, fieldName, endpointKey) {
  const result = requiredText(value, fieldName, endpointKey).toUpperCase();
  if (CURRENCY_CODE.test(result)) return result;
  throw new ApiRequestError(`${fieldName} is invalid for ${endpointKey}.`, {
    code: "INVALID_REQUEST",
    endpointKey,
  });
}

function positiveAmount(value, endpointKey) {
  const normalized = typeof value === "number"
    ? String(value)
    : typeof value === "string"
      ? value.trim()
      : "";
  if (
    DECIMAL_AMOUNT.test(normalized) &&
    /[1-9]/u.test(normalized)
  ) {
    const [whole, fraction = ""] = normalized.split(".");
    const trimmedFraction = fraction.replace(/0+$/u, "");
    return trimmedFraction ? `${whole}.${trimmedFraction}` : whole;
  }
  throw new ApiRequestError(`sourceAmount is invalid for ${endpointKey}.`, {
    code: "INVALID_REQUEST",
    endpointKey,
  });
}

function boundedLimit(value, defaultLimit, endpointKey) {
  if (value === undefined || value === null || value === "") return defaultLimit;
  const result = Number(value);
  if (Number.isSafeInteger(result) && result >= 1 && result <= 100) return result;
  throw new ApiRequestError(`limit is invalid for ${endpointKey}.`, {
    code: "INVALID_REQUEST",
    endpointKey,
  });
}

function optionalCursor(value, endpointKey) {
  if (value === undefined || value === null || value === "") return "";
  const result = String(value).trim().toLowerCase();
  if (/^offset_(?:0|[1-9][0-9]{0,6})$/u.test(result)) return result;
  throw new ApiRequestError(`cursor is invalid for ${endpointKey}.`, {
    code: "INVALID_REQUEST",
    endpointKey,
  });
}

function queryPath(path, values) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && String(value) !== "") {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

function idempotencyKey(payload, endpointKey) {
  const result = requiredText(
    payload?.idempotencyKey,
    "idempotencyKey",
    endpointKey,
  );
  if (IDEMPOTENCY_KEY.test(result)) return result;
  throw new ApiRequestError(`idempotencyKey is invalid for ${endpointKey}.`, {
    code: "INVALID_REQUEST",
    endpointKey,
  });
}

function quotePayload(payload, endpointKey) {
  const product = requiredText(payload?.product, "product", endpointKey).toLowerCase();
  if (!PRODUCTS.has(product)) {
    throw new ApiRequestError(`product is invalid for ${endpointKey}.`, {
      code: "INVALID_REQUEST",
      endpointKey,
    });
  }
  return {
    sourceAccountKey: publicKey(
      payload?.sourceAccountKey,
      ACCOUNT_KEY,
      "sourceAccountKey",
      endpointKey,
    ),
    targetCurrencyCode: currencyCode(
      payload?.targetCurrencyCode,
      "targetCurrencyCode",
      endpointKey,
    ),
    sourceAmount: positiveAmount(payload?.sourceAmount, endpointKey),
    product,
    idempotencyKey: idempotencyKey(payload, endpointKey),
  };
}

function orderPayload(payload, endpointKey) {
  return {
    quoteKey: publicKey(payload?.quoteKey, QUOTE_KEY, "quoteKey", endpointKey),
    idempotencyKey: idempotencyKey(payload, endpointKey),
  };
}

const ROUTE_BUILDERS = Object.freeze({
  bankingFx: () => ({ method: "GET", path: "/players/me/banking/fx" }),
  bankingFxHistory: ({ payload = {} }) => {
    const endpointKey = "bankingFxHistory";
    const range = String(payload.range || "7d").trim().toLowerCase();
    if (!HISTORY_RANGES.has(range)) {
      throw new ApiRequestError(`range is invalid for ${endpointKey}.`, {
        code: "INVALID_REQUEST",
        endpointKey,
      });
    }
    return {
      method: "GET",
      path: queryPath("/players/me/banking/fx/history", {
        sourceCurrencyCode: currencyCode(
          payload.sourceCurrencyCode,
          "sourceCurrencyCode",
          endpointKey,
        ),
        targetCurrencyCode: currencyCode(
          payload.targetCurrencyCode,
          "targetCurrencyCode",
          endpointKey,
        ),
        range,
        limit: boundedLimit(payload.limit, 100, endpointKey),
        cursor: optionalCursor(payload.cursor, endpointKey),
      }),
    };
  },
  bankingFxOrders: ({ payload = {} }) => {
    const endpointKey = "bankingFxOrders";
    const status = String(payload.status || "all").trim().toLowerCase();
    if (!ORDER_STATUSES.has(status)) {
      throw new ApiRequestError(`status is invalid for ${endpointKey}.`, {
        code: "INVALID_REQUEST",
        endpointKey,
      });
    }
    return {
      method: "GET",
      path: queryPath("/players/me/banking/fx/orders", {
        status,
        limit: boundedLimit(payload.limit, 25, endpointKey),
        cursor: optionalCursor(payload.cursor, endpointKey),
      }),
    };
  },
  bankingFxQuote: ({ payload = {} }) => ({
    method: "POST",
    path: "/players/me/banking/fx/quotes",
    payload: quotePayload(payload, "bankingFxQuote"),
  }),
  bankingFxStandard: ({ payload = {} }) => ({
    method: "POST",
    path: "/players/me/banking/fx/orders/standard",
    payload: orderPayload(payload, "bankingFxStandard"),
  }),
  bankingFxInstant: ({ payload = {} }) => ({
    method: "POST",
    path: "/players/me/banking/fx/orders/instant",
    payload: orderPayload(payload, "bankingFxInstant"),
  }),
  bankingFxCancel: ({ params = {}, payload = {} }) => {
    const endpointKey = "bankingFxCancel";
    const orderKey = publicKey(
      params.orderKey || payload.orderKey,
      ORDER_KEY,
      "orderKey",
      endpointKey,
    );
    return {
      method: "POST",
      path: `/players/me/banking/fx/orders/${encodeURIComponent(orderKey)}/cancel`,
      payload: { idempotencyKey: idempotencyKey(payload, endpointKey) },
    };
  },
});

export const BANKING_FX_BACKEND_ROUTE_KEYS = Object.freeze(
  Object.keys(ROUTE_BUILDERS),
);

export function hasBankingFxBackendRoute(endpointKey) {
  return Object.hasOwn(ROUTE_BUILDERS, endpointKey);
}

export function resolveBankingFxBackendRequest(input) {
  const builder = ROUTE_BUILDERS[input?.endpointKey];
  if (!builder) return null;
  const resolved = builder(input);
  return {
    endpointKey: input.endpointKey,
    method: resolved.method,
    path: resolved.path,
    payload: resolved.payload,
  };
}
