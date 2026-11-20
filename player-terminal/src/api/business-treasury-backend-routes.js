import { ApiRequestError } from "./errors.js";

function requiredText(value, fieldName, endpointKey) {
  const text = typeof value === "string" ? value.trim() : "";
  if (text) return text;
  throw new ApiRequestError(`${fieldName} is required for ${endpointKey}.`, {
    body: { code: "player_route_context_missing", fieldName, endpointKey },
  });
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

function optionalPublicKey(value, pattern, fieldName, endpointKey) {
  if (value === undefined || value === null || value === "") return null;
  return requiredPublicKey(value, pattern, fieldName, endpointKey);
}

function requiredPositiveInteger(value, fieldName, endpointKey) {
  const candidate = Number(value);
  if (Number.isSafeInteger(candidate) && candidate >= 1 && candidate <= 1_000_000) return candidate;
  throw new ApiRequestError(`${fieldName} is invalid for ${endpointKey}.`, {
    body: { code: "player_positive_integer_invalid", fieldName, endpointKey },
  });
}

function requiredCurrencyCode(value, fieldName, endpointKey) {
  const candidate = requiredText(value, fieldName, endpointKey).toUpperCase();
  if (/^[A-Z0-9_]{3,16}$/u.test(candidate)) return candidate;
  throw new ApiRequestError(`${fieldName} is invalid for ${endpointKey}.`, {
    body: { code: "player_currency_code_invalid", fieldName, endpointKey },
  });
}

function requiredDecimalAmount(value, fieldName, endpointKey) {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (/^(?:0|[1-9][0-9]{0,19})(?:\.[0-9]{1,18})?$/u.test(candidate) && /[1-9]/u.test(candidate)) {
    const [whole, fraction = ""] = candidate.split(".");
    const canonicalFraction = fraction.replace(/0+$/u, "");
    return canonicalFraction ? `${whole}.${canonicalFraction}` : whole;
  }
  throw new ApiRequestError(`${fieldName} is invalid for ${endpointKey}.`, {
    body: { code: "player_decimal_amount_invalid", fieldName, endpointKey },
  });
}

function requiredFxProduct(value, endpointKey) {
  const candidate = requiredText(value, "product", endpointKey).toLowerCase();
  if (candidate === "standard" || candidate === "instant") return candidate;
  throw new ApiRequestError(`product is invalid for ${endpointKey}.`, {
    body: { code: "player_fx_product_invalid", fieldName: "product", endpointKey },
  });
}

function requiredStoreItemKey(value, endpointKey) {
  const candidate = requiredText(value, "itemKey", endpointKey).toLowerCase();
  if (/^[a-z0-9_-]{1,64}$/u.test(candidate)) return candidate;
  throw new ApiRequestError(`itemKey is invalid for ${endpointKey}.`, {
    body: { code: "player_store_item_key_invalid", fieldName: "itemKey", endpointKey },
  });
}

function requiredFundingAllocations(value, endpointKey) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) {
    throw new ApiRequestError(`allocations is invalid for ${endpointKey}.`, {
      body: { code: "player_funding_allocations_invalid", fieldName: "allocations", endpointKey },
    });
  }
  const accounts = new Set();
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new ApiRequestError(`allocations[${index}] is invalid for ${endpointKey}.`, {
        body: { code: "player_funding_allocation_invalid", fieldName: `allocations[${index}]`, endpointKey },
      });
    }
    const sourceAccountKey = requiredPublicKey(entry.sourceAccountKey, /^bac_[0-9a-f]{32}$/u, `allocations[${index}].sourceAccountKey`, endpointKey);
    if (accounts.has(sourceAccountKey)) {
      throw new ApiRequestError(`allocations is invalid for ${endpointKey}.`, {
        body: { code: "player_funding_accounts_duplicate", fieldName: "allocations", endpointKey },
      });
    }
    accounts.add(sourceAccountKey);
    const finalAllocation = index === value.length - 1;
    if (finalAllocation && entry.targetAmount !== null) {
      throw new ApiRequestError(`allocations[${index}] is invalid for ${endpointKey}.`, {
        body: { code: "player_funding_remainder_invalid", fieldName: `allocations[${index}].targetAmount`, endpointKey },
      });
    }
    if (!finalAllocation && entry.targetAmount === null) {
      throw new ApiRequestError(`allocations[${index}] is invalid for ${endpointKey}.`, {
        body: { code: "player_funding_fixed_amount_invalid", fieldName: `allocations[${index}].targetAmount`, endpointKey },
      });
    }
    return {
      sourceAccountKey,
      targetAmount: finalAllocation ? null : requiredDecimalAmount(entry.targetAmount, `allocations[${index}].targetAmount`, endpointKey),
    };
  });
}

export const BUSINESS_TREASURY_ROUTE_BUILDERS = Object.freeze({
businessTreasury: () => ({
    method: "GET",
    path: "/players/me/business/treasury",
  }),
  businessTreasuryAccountOpen: ({ payload = {} }) => ({
    method: "POST",
    path: "/players/me/business/treasury/accounts",
    payload: {
      currencyCode: requiredCurrencyCode(
        payload.currencyCode,
        "currencyCode",
        "businessTreasuryAccountOpen",
      ),
      idempotencyKey: idempotencyKey(payload, "businessTreasuryAccountOpen"),
    },
  }),
  businessTreasuryFxQuote: ({ payload = {} }) => ({
    method: "POST",
    path: "/players/me/business/treasury/fx/quotes",
    payload: {
      sourceAccountKey: requiredPublicKey(
        payload.sourceAccountKey,
        /^bac_[0-9a-f]{32}$/u,
        "sourceAccountKey",
        "businessTreasuryFxQuote",
      ),
      targetAccountKey: optionalPublicKey(
        payload.targetAccountKey,
        /^bac_[0-9a-f]{32}$/u,
        "targetAccountKey",
        "businessTreasuryFxQuote",
      ),
      targetCurrencyCode: requiredCurrencyCode(
        payload.targetCurrencyCode,
        "targetCurrencyCode",
        "businessTreasuryFxQuote",
      ),
      sourceAmount: requiredDecimalAmount(
        payload.sourceAmount,
        "sourceAmount",
        "businessTreasuryFxQuote",
      ),
      product: requiredFxProduct(payload.product, "businessTreasuryFxQuote"),
      idempotencyKey: idempotencyKey(payload, "businessTreasuryFxQuote"),
    },
  }),
  businessTreasuryFxStandard: ({ payload = {} }) => ({
    method: "POST",
    path: "/players/me/business/treasury/fx/orders/standard",
    payload: {
      quoteKey: requiredPublicKey(
        payload.quoteKey,
        /^fxq_[0-9a-f]{32}$/u,
        "quoteKey",
        "businessTreasuryFxStandard",
      ),
      idempotencyKey: idempotencyKey(payload, "businessTreasuryFxStandard"),
    },
  }),
  businessTreasuryFxInstant: ({ payload = {} }) => ({
    method: "POST",
    path: "/players/me/business/treasury/fx/orders/instant",
    payload: {
      quoteKey: requiredPublicKey(
        payload.quoteKey,
        /^fxq_[0-9a-f]{32}$/u,
        "quoteKey",
        "businessTreasuryFxInstant",
      ),
      idempotencyKey: idempotencyKey(payload, "businessTreasuryFxInstant"),
    },
  }),
  businessTreasuryFxCancel: ({ params = {}, payload = {} }) => {
    const endpointKey = "businessTreasuryFxCancel";
    const orderKey = requiredPublicKey(
      params.orderKey || payload.orderKey,
      /^fxo_[0-9a-f]{32}$/u,
      "orderKey",
      endpointKey,
    );
    return {
      method: "POST",
      path: `/players/me/business/treasury/fx/orders/${encodeURIComponent(orderKey)}/cancel`,
      payload: { idempotencyKey: idempotencyKey(payload, endpointKey) },
    };
  },
  businessStoreQuote: ({ payload = {} }) => ({
    method: "POST",
    path: "/players/me/business/store/quotes",
    payload: {
      itemKey: requiredStoreItemKey(payload.itemKey, "businessStoreQuote"),
      quantity: requiredPositiveInteger(payload.quantity, "quantity", "businessStoreQuote"),
      allocations: requiredFundingAllocations(payload.allocations, "businessStoreQuote"),
      idempotencyKey: idempotencyKey(payload, "businessStoreQuote"),
    },
  }),
  businessStorePurchase: ({ payload = {} }) => ({
    method: "POST",
    path: "/players/me/business/store/purchases",
    payload: {
      quoteKey: requiredPublicKey(
        payload.quoteKey,
        /^bsq_[0-9a-f]{32}$/u,
        "quoteKey",
        "businessStorePurchase",
      ),
      idempotencyKey: idempotencyKey(payload, "businessStorePurchase"),
      clientSubmittedAt: typeof payload.clientSubmittedAt === "string"
        ? payload.clientSubmittedAt
        : null,
    },
  })
});
