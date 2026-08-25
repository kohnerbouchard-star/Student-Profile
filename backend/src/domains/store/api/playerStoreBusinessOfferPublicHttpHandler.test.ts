import { PlayerStorePublicError } from "../contracts/playerStorePublicContracts.ts";
import { handlePlayerStorePublicRequest } from "./playerStorePublicHttpHandler.ts";
import {
  assertEquals,
  assertError,
  assertNoInternalFields,
  assertNoUuid,
  assertPrivateNoStore,
  CapturingOfferRepository,
  CapturingRepository,
  createPlayerStoreHandlerDependencies,
  createPlayerStoreRequest,
  GAME_ID,
  OFFER_KEY,
  OFFER_RECEIPT_KEY,
  PLAYER_ID,
  QUOTE_KEY,
  RECEIPT_KEY,
  validOfferQuoteBody,
} from "./playerStorePublicHttpHandlerTestSupport.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("Player Store Business quote uses trusted scope and strips internal fields", async () => {
  const repository = new CapturingRepository();
  const offerRepository = new CapturingOfferRepository();
  const response = await handlePlayerStorePublicRequest(
    createPlayerStoreRequest(
      "POST",
      "/players/me/store/offer-quotes",
      validOfferQuoteBody(),
    ),
    { kind: "offerQuotes" },
    createPlayerStoreHandlerDependencies(repository, offerRepository),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.quote.offerKey, OFFER_KEY);
  assertEquals(body.quote.offerVersion, 7);
  assertEquals(offerRepository.quoteInputs, [{
    gameSessionId: GAME_ID,
    playerId: PLAYER_ID,
    offerKey: OFFER_KEY,
    quantity: 2,
    expectedVersion: 7,
    idempotencyKey: "store.offer.quote.12345678",
  }]);
  assertEquals(repository.quoteInputs.length, 0);
  assertNoUuid(body);
  assertNoInternalFields(body);
  assertPrivateNoStore(response);
});

Deno.test("Player Store Business purchase and receipt read remain Buyer scoped", async () => {
  const repository = new CapturingRepository();
  const offerRepository = new CapturingOfferRepository();
  const purchaseResponse = await handlePlayerStorePublicRequest(
    createPlayerStoreRequest("POST", "/players/me/store/offer-purchases", {
      offerKey: OFFER_KEY,
      quoteKey: QUOTE_KEY,
      quantity: 2,
      expectedVersion: 7,
      idempotencyKey: "store.offer.purchase.12345678",
      clientSubmittedAt: "2026-07-19T02:01:00.000Z",
    }),
    { kind: "offerPurchases" },
    createPlayerStoreHandlerDependencies(repository, offerRepository),
  );
  const purchaseBody = await purchaseResponse.json();

  assertEquals(purchaseResponse.status, 200);
  assertEquals(purchaseBody.receipt.receiptKey, OFFER_RECEIPT_KEY);
  assertEquals(purchaseBody.receipt.offerKey, OFFER_KEY);
  assertEquals(purchaseBody.refreshRequired, true);
  assertEquals(offerRepository.purchaseInputs, [{
    gameSessionId: GAME_ID,
    playerId: PLAYER_ID,
    offerKey: OFFER_KEY,
    quoteKey: QUOTE_KEY,
    quantity: 2,
    expectedVersion: 7,
    idempotencyKey: "store.offer.purchase.12345678",
  }]);
  assertEquals(repository.purchaseInputs.length, 0);
  assertNoUuid(purchaseBody);
  assertNoInternalFields(purchaseBody);

  const receiptResponse = await handlePlayerStorePublicRequest(
    createPlayerStoreRequest(
      "GET",
      `/players/me/store/receipts/${OFFER_RECEIPT_KEY}`,
    ),
    { kind: "offerReceipt", receiptKey: OFFER_RECEIPT_KEY },
    createPlayerStoreHandlerDependencies(repository, offerRepository),
  );
  const receiptBody = await receiptResponse.json();

  assertEquals(receiptResponse.status, 200);
  assertEquals(receiptBody.receipt.receiptKey, OFFER_RECEIPT_KEY);
  assertEquals(offerRepository.receiptInputs, [{
    gameSessionId: GAME_ID,
    playerId: PLAYER_ID,
    receiptKey: OFFER_RECEIPT_KEY,
  }]);
  assertNoUuid(receiptBody);
  assertNoInternalFields(receiptBody);
  assertPrivateNoStore(receiptResponse);
});

Deno.test("Player Store Business routes reject mixed authorities and malformed intent", async () => {
  const repository = new CapturingRepository();
  const offerRepository = new CapturingOfferRepository();
  const cases: readonly {
    route: { readonly kind: "offerQuotes" | "offerPurchases" };
    path: string;
    body: Record<string, unknown>;
  }[] = [
    {
      route: { kind: "offerQuotes" },
      path: "/players/me/store/offer-quotes",
      body: {
        itemKey: "field_permit",
        quantity: 1,
        expectedVersion: 7,
        idempotencyKey: "store.offer.quote.12345678",
      },
    },
    {
      route: { kind: "offerQuotes" },
      path: "/players/me/store/offer-quotes",
      body: {
        offerKey: OFFER_KEY.toUpperCase(),
        quantity: 1,
        expectedVersion: 7,
        idempotencyKey: "store.offer.quote.12345678",
      },
    },
    {
      route: { kind: "offerQuotes" },
      path: "/players/me/store/offer-quotes",
      body: {
        offerKey: OFFER_KEY,
        quantity: "1",
        expectedVersion: 7,
        idempotencyKey: "store.offer.quote.12345678",
      },
    },
    {
      route: { kind: "offerQuotes" },
      path: "/players/me/store/offer-quotes",
      body: {
        offerKey: OFFER_KEY,
        quantity: 1,
        expectedOfferVersion: 7,
        idempotencyKey: "store.offer.quote.12345678",
      },
    },
    {
      route: { kind: "offerQuotes" },
      path: "/players/me/store/offer-quotes",
      body: {
        offerKey: OFFER_KEY,
        quantity: 1,
        expectedVersion: 0,
        idempotencyKey: "store.offer.quote.12345678",
      },
    },
    {
      route: { kind: "offerQuotes" },
      path: "/players/me/store/offer-quotes",
      body: {
        offerKey: OFFER_KEY,
        quantity: 1,
        expectedVersion: 7,
        idempotencyKey: "short",
      },
    },
    {
      route: { kind: "offerPurchases" },
      path: "/players/me/store/offer-purchases",
      body: {
        offerKey: OFFER_KEY,
        quoteKey: RECEIPT_KEY,
        quantity: 1,
        expectedVersion: 7,
        idempotencyKey: "store.offer.purchase.12345678",
      },
    },
    {
      route: { kind: "offerPurchases" },
      path: "/players/me/store/offer-purchases",
      body: {
        offerKey: OFFER_KEY,
        quoteKey: QUOTE_KEY,
        quantity: 1,
        expectedVersion: 7,
        idempotencyKey: "store.offer.purchase.12345678",
        clientSubmittedAt: "2026-07-19T02:01:00Z",
      },
    },
  ];

  for (const testCase of cases) {
    const response = await handlePlayerStorePublicRequest(
      createPlayerStoreRequest("POST", testCase.path, testCase.body),
      testCase.route,
      createPlayerStoreHandlerDependencies(repository, offerRepository),
    );
    await assertError(response, 400, "invalid_player_store_request");
  }

  const itemQuoteWithOffer = await handlePlayerStorePublicRequest(
    createPlayerStoreRequest("POST", "/players/me/store/quotes", {
      offerKey: OFFER_KEY,
      quantity: 1,
    }),
    { kind: "quotes" },
    createPlayerStoreHandlerDependencies(repository, offerRepository),
  );
  await assertError(itemQuoteWithOffer, 400, "invalid_player_store_request");
  assertEquals(offerRepository.quoteInputs.length, 0);
  assertEquals(offerRepository.purchaseInputs.length, 0);
  assertEquals(repository.quoteInputs.length, 0);
});

Deno.test("Player Store Business routes reject wrong methods before repository work", async () => {
  const repository = new CapturingRepository();
  const offerRepository = new CapturingOfferRepository();
  const cases = [
    ["GET", "/players/me/store/offer-quotes", { kind: "offerQuotes" }],
    ["GET", "/players/me/store/offer-purchases", { kind: "offerPurchases" }],
    ["POST", `/players/me/store/receipts/${OFFER_RECEIPT_KEY}`, {
      kind: "offerReceipt",
      receiptKey: OFFER_RECEIPT_KEY,
    }],
  ] as const;

  for (const [method, path, route] of cases) {
    const response = await handlePlayerStorePublicRequest(
      createPlayerStoreRequest(method, path),
      route,
      createPlayerStoreHandlerDependencies(repository, offerRepository),
    );
    await assertError(response, 405, "method_not_allowed");
  }
  assertEquals(offerRepository.totalCalls(), 0);
});

Deno.test("Player Store preserves stable public repository errors and hides unknown failures", async () => {
  const stable = new CapturingOfferRepository();
  stable.quoteError = new PlayerStorePublicError(
    "store_offer_withdrawal_pending",
    "Store offer withdrawal is pending.",
    409,
    false,
  );
  const stableResponse = await handlePlayerStorePublicRequest(
    createPlayerStoreRequest(
      "POST",
      "/players/me/store/offer-quotes",
      validOfferQuoteBody(),
    ),
    { kind: "offerQuotes" },
    createPlayerStoreHandlerDependencies(new CapturingRepository(), stable),
  );
  const stableBody = await stableResponse.json();
  assertEquals(stableResponse.status, 409);
  assertEquals(stableBody.error, {
    code: "store_offer_withdrawal_pending",
    message: "Store offer withdrawal is pending.",
    retryable: false,
  });

  const unknown = new CapturingOfferRepository();
  unknown.quoteError = new Error(`database failed for ${GAME_ID}`);
  const unknownResponse = await handlePlayerStorePublicRequest(
    createPlayerStoreRequest(
      "POST",
      "/players/me/store/offer-quotes",
      validOfferQuoteBody(),
    ),
    { kind: "offerQuotes" },
    createPlayerStoreHandlerDependencies(new CapturingRepository(), unknown),
  );
  const unknownBody = await unknownResponse.json();
  assertEquals(unknownResponse.status, 500);
  assertEquals(unknownBody.error, {
    code: "player_store_request_failed",
    message: "Player Store request failed.",
    retryable: false,
  });
  assertNoUuid(unknownBody);
});
