import assert from "node:assert/strict";

import { PlayerApi } from "../src/api/player-api.js";
import { ApiRequestError, playerSafeErrorMessage } from "../src/api/errors.js";
import {
  dispatchStoreSessionInvalid,
  resolveStorePurchaseFailure,
  storeQuoteFromOperation
} from "../src/features/store/store-purchase-flow.js";

const QUOTE_KEY = "quote_11111111111111111111111111111111";
const RECEIPT_KEY = "receipt_22222222222222222222222222222222";

assert.deepEqual(
  storeQuoteFromOperation({ ok: true, quote: { quoteKey: QUOTE_KEY, quantity: 2 } }),
  { quoteKey: QUOTE_KEY, quantity: 2 },
  "The Store flow must unwrap the reviewed Backend quote envelope before confirmation."
);

const failureCases = [
  {
    code: "STORE_INSUFFICIENT_BALANCE",
    message: "You do not have enough available checking funds for this Store purchase.",
    resetQuote: false,
    retryable: false
  },
  {
    code: "STORE_INSUFFICIENT_STOCK",
    message: "The requested quantity is no longer available. Request a new Store quote.",
    resetQuote: true,
    retryable: false
  },
  {
    code: "STORE_QUOTE_EXPIRED",
    message: "This Store quote expired. Request a new authoritative quote.",
    resetQuote: true,
    retryable: false
  },
  {
    code: "STORE_IDEMPOTENCY_CONFLICT",
    message: "This purchase request conflicts with an earlier Store request. Review the purchase and try again.",
    resetQuote: false,
    retryable: false
  },
  {
    code: "STORE_PURCHASE_IN_PROGRESS",
    message: "This Store purchase is still processing. Wait a moment before retrying.",
    resetQuote: false,
    retryable: true
  },
  {
    code: "STORE_OFFER_WITHDRAWAL_PENDING",
    message: "This seller offer is being withdrawn and can no longer be purchased. Refresh the Store and choose another offer.",
    resetQuote: true,
    retryable: false
  },
  {
    code: "STORE_OFFER_VERSION_CONFLICT",
    message: "This seller offer changed. Refresh the Store before requesting a new quote.",
    resetQuote: true,
    retryable: false
  },
  {
    code: "STORE_OFFER_SELF_PURCHASE_FORBIDDEN",
    message: "You cannot purchase an offer from your own Business.",
    resetQuote: false,
    retryable: false
  },
  {
    code: "STORE_OFFER_SETTLEMENT_OFFER_CONFLICT",
    message: "This seller offer changed after the quote was issued. Request a new quote.",
    resetQuote: true,
    retryable: false
  },
  {
    code: "PLAYER_STORE_OFFER_PURCHASE_FAILED",
    message: "The Business offer purchase could not be completed. No funds or inventory moved.",
    resetQuote: false,
    retryable: false
  }
];

for (const testCase of failureCases) {
  const error = new ApiRequestError(
    playerSafeErrorMessage({ status: 409, code: testCase.code }),
    { status: 409, code: testCase.code, endpointKey: "storePurchase" }
  );
  const failure = resolveStorePurchaseFailure(error);
  assert.equal(failure.code, testCase.code);
  assert.equal(failure.message, testCase.message);
  assert.equal(failure.resetQuote, testCase.resetQuote);
  assert.equal(failure.retryable, testCase.retryable);
  assert.equal(failure.sessionInvalid, false);
}

{
  const callbacks = [];
  const events = [];
  class FakeCustomEvent {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
    }
  }
  const runtime = {
    CustomEvent: FakeCustomEvent,
    dispatchEvent(event) {
      events.push(event);
      return true;
    }
  };
  const error = new ApiRequestError("Player session is invalid.", {
    status: 401,
    code: "INVALID_PLAYER_SESSION",
    requestId: "req-store-paused"
  });
  const dispatched = dispatchStoreSessionInvalid(error, {
    sessionInvalidEvent: "econovaria:player-session-invalid",
    onSessionInvalid(detail) {
      callbacks.push(detail);
    }
  }, runtime);

  assert.equal(dispatched, true);
  assert.equal(callbacks.length, 1);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "econovaria:player-session-invalid");
  assert.deepEqual(events[0].detail, {
    reason: "invalid_player_session",
    terminal: "player",
    status: 401,
    code: "INVALID_PLAYER_SESSION",
    requestId: "req-store-paused"
  });
}

{
  const calls = [];
  let attempt = 0;
  const api = new PlayerApi({
    usePreviewData: false,
    playerSessionToken: "token-1",
    requestTimeoutMs: 1000,
    writeCooldownMs: 0,
    apiCall: async (context) => {
      calls.push({
        endpointKey: context.endpointKey,
        idempotencyKey: context.idempotencyKey,
        payload: structuredClone(context.payload)
      });
      attempt += 1;
      if (attempt === 1) {
        throw new ApiRequestError("The player terminal could not reach the game service.", {
          code: "NETWORK_ERROR",
          endpointKey: context.endpointKey
        });
      }
      return {
        ok: true,
        receipt: {
          receiptKey: RECEIPT_KEY,
          quoteKey: QUOTE_KEY,
          itemKey: "field_permit",
          itemName: "Field Permit",
          quantity: 1,
          finalUnitPrice: 50,
          finalTotalPrice: 50,
          currencyCode: "NRC",
          inventoryQuantityOwned: 1,
          completedAt: "2026-07-19T04:00:01.000Z",
          alreadyCompleted: false
        }
      };
    }
  });
  const payload = { quoteKey: QUOTE_KEY, clientSubmittedAt: "2026-07-19T04:00:00.000Z" };

  await assert.rejects(
    api.execute("storePurchase", payload),
    (error) => error.code === "NETWORK_ERROR"
  );
  const replay = await api.execute("storePurchase", payload);

  assert.equal(replay.result.receipt.receiptKey, RECEIPT_KEY);
  assert.equal(calls.length, 2);
  assert.match(calls[0].idempotencyKey, /^ptr_storePurchase_/);
  assert.equal(
    calls[1].idempotencyKey,
    calls[0].idempotencyKey,
    "A transient retry must reuse the same idempotency key so the Backend can return one receipt."
  );
}

{
  const calls = [];
  const api = new PlayerApi({
    usePreviewData: false,
    playerSessionToken: "token-1",
    requestTimeoutMs: 1000,
    writeCooldownMs: 0,
    apiCall: async (context) => {
      calls.push(context.idempotencyKey);
      throw new ApiRequestError(
        playerSafeErrorMessage({ status: 409, code: "STORE_INSUFFICIENT_BALANCE" }),
        { status: 409, code: "STORE_INSUFFICIENT_BALANCE" }
      );
    }
  });
  const payload = { quoteKey: QUOTE_KEY, clientSubmittedAt: "2026-07-19T04:00:00.000Z" };

  await assert.rejects(api.execute("storePurchase", payload));
  await assert.rejects(api.execute("storePurchase", payload));
  assert.notEqual(
    calls[0],
    calls[1],
    "A non-transient rejection must not pin the earlier idempotency key to a later manual retry."
  );
}

for (const [endpointKey, payload] of [
  ["storeOfferQuote", { offerKey: "sof_11111111111111111111111111111111", quantity: 1, expectedVersion: 2 }],
  ["storeOfferPurchase", { offerKey: "sof_11111111111111111111111111111111", quoteKey: QUOTE_KEY, quantity: 1, expectedVersion: 2 }]
]) {
  const calls = [];
  let attempt = 0;
  const retryApi = new PlayerApi({
    usePreviewData: false,
    playerSessionToken: "token-1",
    requestTimeoutMs: 1000,
    writeCooldownMs: 0,
    apiCall: async (context) => {
      calls.push(context.idempotencyKey);
      attempt += 1;
      if (attempt === 1) {
        throw new ApiRequestError("The player terminal could not reach the game service.", {
          code: "NETWORK_ERROR",
          endpointKey
        });
      }
      return { ok: true };
    }
  });
  await assert.rejects(retryApi.execute(endpointKey, payload), (error) => error.code === "NETWORK_ERROR");
  await retryApi.execute(endpointKey, payload);
  assert.match(calls[0], new RegExp(`^ptr_${endpointKey}_`));
  assert.equal(calls[1], calls[0], `${endpointKey} must reuse its idempotency key after an ambiguous network failure.`);
}

{
  const calls = [];
  let attempt = 0;
  const abortedApi = new PlayerApi({
    usePreviewData: false,
    playerSessionToken: "token-1",
    requestTimeoutMs: 1000,
    writeCooldownMs: 0,
    apiCall: async (context) => {
      calls.push(context.idempotencyKey);
      attempt += 1;
      if (attempt === 1) {
        throw new ApiRequestError("The settlement response was interrupted.", {
          code: "REQUEST_ABORTED",
          endpointKey: context.endpointKey
        });
      }
      return { ok: true };
    }
  });
  const payload = {
    offerKey: "sof_11111111111111111111111111111111",
    quoteKey: QUOTE_KEY,
    quantity: 1,
    expectedVersion: 2
  };
  await assert.rejects(
    abortedApi.execute("storeOfferPurchase", payload),
    (error) => error.code === "REQUEST_ABORTED"
  );
  await abortedApi.execute("storeOfferPurchase", payload);
  assert.equal(
    calls[1],
    calls[0],
    "An interrupted idempotent settlement response must retain its key for authoritative replay recovery."
  );
}

console.log("Store negative-state matrix passed: checking-balance errors, quote envelope, stale-quote recovery, safe exit, and duplicate retry semantics are valid.");
