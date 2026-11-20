import { handlePlayerStorePublicRequest } from "./playerStorePublicHttpHandler.ts";
import {
  playerStoreRouteRateLimitKey,
  readPlayerStorePublicRoutePath,
} from "./playerStorePublicRoutePaths.ts";
import {
  ACCOUNT_KEY,
  assertEquals,
  assertError,
  assertNoInternalFields,
  assertNoUuid,
  CapturingFundingRepository,
  CapturingOfferRepository,
  CapturingRepository,
  createPlayerStoreHandlerDependencies,
  createPlayerStoreRequest,
  GAME_ID,
  OFFER_KEY,
  PLAYER_ID,
  QUOTE_KEY,
  RECEIPT_KEY,
} from "./playerStorePublicHttpHandlerTestSupport.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("Player Store route parser separates item and Business-offer paths", () => {
  assertEquals(readPlayerStorePublicRoutePath("/players/me/store/items"), {
    kind: "items",
  });
  assertEquals(readPlayerStorePublicRoutePath("/players/me/store/quotes"), {
    kind: "quotes",
  });
  assertEquals(readPlayerStorePublicRoutePath("/players/me/store/purchases"), {
    kind: "purchases",
  });
  assertEquals(
    readPlayerStorePublicRoutePath("/players/me/store/offer-quotes"),
    { kind: "offerQuotes" },
  );
  assertEquals(
    readPlayerStorePublicRoutePath("/players/me/store/offer-purchases"),
    { kind: "offerPurchases" },
  );
  assertEquals(
    readPlayerStorePublicRoutePath(
      `/players/me/store/receipts/spr_${"a".repeat(32)}`,
    ),
    { kind: "offerReceipt", receiptKey: `spr_${"a".repeat(32)}` },
  );
  assertEquals(readPlayerStorePublicRoutePath("/players/me/store/quote"), null);
  assertEquals(
    readPlayerStorePublicRoutePath("/players/me/store/items/private"),
    null,
  );
  assertEquals(
    readPlayerStorePublicRoutePath("/players/me/store/receipts/receipt_old"),
    null,
  );
  assertEquals(
    readPlayerStorePublicRoutePath(
      "/players/me/store/receipts/spr_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    ),
    null,
  );

  assertEquals(playerStoreRouteRateLimitKey({ kind: "items" }), "store");
  assertEquals(playerStoreRouteRateLimitKey({ kind: "quotes" }), "storeQuote");
  assertEquals(
    playerStoreRouteRateLimitKey({ kind: "offerQuotes" }),
    "storeQuote",
  );
  assertEquals(
    playerStoreRouteRateLimitKey({ kind: "purchases" }),
    "storePurchase",
  );
  assertEquals(
    playerStoreRouteRateLimitKey({ kind: "offerPurchases" }),
    "storePurchase",
  );
  assertEquals(
    playerStoreRouteRateLimitKey({
      kind: "offerReceipt",
      receiptKey: `spr_${"a".repeat(32)}`,
    }),
    "storePurchase",
  );
});

Deno.test("Player Store list and quote responses expose public keys only", async () => {
  const repository = new CapturingRepository();
  const offerRepository = new CapturingOfferRepository();
  const fundingRepository = new CapturingFundingRepository();
  const listResponse = await handlePlayerStorePublicRequest(
    createPlayerStoreRequest("GET", "/players/me/store/items"),
    { kind: "items" },
    createPlayerStoreHandlerDependencies(repository, offerRepository),
  );
  const listBody = await listResponse.json();

  assertEquals(listResponse.status, 200);
  assertEquals(listBody.items[0].itemKey, "field_permit");
  assertEquals(listBody.products[0].storeItemKey, "field_permit");
  assertEquals(listBody.products[0].offers[0].offerKey, OFFER_KEY);
  assertEquals(
    listBody.products[0].offers.map((offer: { purchasability: string }) =>
      offer.purchasability
    ),
    ["business_offer", "system_offer", "system_offer"],
  );
  assertEquals(offerRepository.productInputs, [{
    gameSessionId: GAME_ID,
    playerId: PLAYER_ID,
  }]);
  assertNoUuid(listBody);
  assertNoInternalFields(listBody);

  const quoteResponse = await handlePlayerStorePublicRequest(
    createPlayerStoreRequest("POST", "/players/me/store/quotes", {
      offerKey: `sof_${"1".repeat(32)}`,
      quantity: 2,
      expectedVersion: 2,
      allocations: [{ sourceAccountKey: ACCOUNT_KEY, targetAmount: null }],
      idempotencyKey: "store.seeded.quote.12345678",
    }),
    { kind: "quotes" },
    createPlayerStoreHandlerDependencies(
      repository,
      new CapturingOfferRepository(),
      fundingRepository,
    ),
  );
  const quoteBody = await quoteResponse.json();

  assertEquals(quoteResponse.status, 200);
  assertEquals(quoteBody.quote.quoteKey, QUOTE_KEY);
  assertEquals(fundingRepository.seededQuoteInputs[0], {
    gameSessionId: GAME_ID,
    playerId: PLAYER_ID,
    offerKey: `sof_${"1".repeat(32)}`,
    quantity: 2,
    expectedVersion: 2,
    allocations: [{ sourceAccountKey: ACCOUNT_KEY, targetAmount: null }],
    idempotencyKey: "store.seeded.quote.12345678",
  });
  assertEquals(quoteBody.quote.fundingQuote.targetAmount, "100.00");
  assertEquals(
    quoteBody.quote.fundingQuote.lines[0].referenceRate,
    "1.000000000000000000",
  );
  assertNoUuid(quoteBody);
});

Deno.test("Player Store purchase uses session scope and returns public receipt", async () => {
  const repository = new CapturingRepository();
  const fundingRepository = new CapturingFundingRepository();
  const response = await handlePlayerStorePublicRequest(
    createPlayerStoreRequest("POST", "/players/me/store/purchases", {
      quoteKey: QUOTE_KEY,
      idempotencyKey: "store.test.12345678",
    }),
    { kind: "purchases" },
    createPlayerStoreHandlerDependencies(
      repository,
      new CapturingOfferRepository(),
      fundingRepository,
    ),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.receipt.receiptKey, RECEIPT_KEY);
  assertEquals(body.receipt.itemKey, "field_permit");
  assertEquals(body.refreshRequired, true);
  assertEquals(fundingRepository.seededPurchaseInputs[0], {
    gameSessionId: GAME_ID,
    playerId: PLAYER_ID,
    quoteKey: QUOTE_KEY,
    idempotencyKey: "store.test.12345678",
  });
  assertEquals(body.receipt.fundingReceipt.targetAmount, "100.00");
  assertNoUuid(body);
});

Deno.test("Player Store funding intent preserves ordered exact decimals and requires a final server remainder", async () => {
  const repository = new CapturingRepository();
  const fundingRepository = new CapturingFundingRepository();
  const secondAccountKey = `bac_${"a".repeat(32)}`;
  const response = await handlePlayerStorePublicRequest(
    createPlayerStoreRequest("POST", "/players/me/store/quotes", {
      offerKey: `sof_${"1".repeat(32)}`,
      quantity: 2,
      expectedVersion: 2,
      allocations: [{
        sourceAccountKey: ACCOUNT_KEY,
        targetAmount: "99999999999999999999.123456789012345678",
      }, {
        sourceAccountKey: secondAccountKey,
        targetAmount: null,
      }],
      idempotencyKey: "store.seeded.multi.12345678",
    }),
    { kind: "quotes" },
    createPlayerStoreHandlerDependencies(
      repository,
      new CapturingOfferRepository(),
      fundingRepository,
    ),
  );

  assertEquals(response.status, 200);
  assertEquals(
    (fundingRepository.seededQuoteInputs[0] as {
      allocations: unknown;
    }).allocations,
    [{
      sourceAccountKey: ACCOUNT_KEY,
      targetAmount: "99999999999999999999.123456789012345678",
    }, {
      sourceAccountKey: secondAccountKey,
      targetAmount: null,
    }],
  );

  const invalidAllocations: readonly unknown[] = [
    [{ sourceAccountKey: ACCOUNT_KEY, targetAmount: 10 }, {
      sourceAccountKey: secondAccountKey,
      targetAmount: null,
    }],
    [{ sourceAccountKey: ACCOUNT_KEY, targetAmount: "10" }, {
      sourceAccountKey: ACCOUNT_KEY,
      targetAmount: null,
    }],
    [{ sourceAccountKey: ACCOUNT_KEY, targetAmount: null }, {
      sourceAccountKey: secondAccountKey,
      targetAmount: "10",
    }],
    [{
      sourceAccountKey: ACCOUNT_KEY,
      targetAmount: null,
      amount: "10",
    }],
  ];

  for (const allocations of invalidAllocations) {
    const invalid = await handlePlayerStorePublicRequest(
      createPlayerStoreRequest("POST", "/players/me/store/quotes", {
        offerKey: `sof_${"1".repeat(32)}`,
        quantity: 2,
        expectedVersion: 2,
        allocations,
        idempotencyKey: "store.seeded.invalid.12345678",
      }),
      { kind: "quotes" },
      createPlayerStoreHandlerDependencies(
        repository,
        new CapturingOfferRepository(),
        fundingRepository,
      ),
    );
    await assertError(invalid, 400, "invalid_player_store_request");
  }
  assertEquals(fundingRepository.seededQuoteInputs.length, 1);
});

Deno.test("Player Store rejects browser-owned scope and unexpected request fields", async () => {
  const repository = new CapturingRepository();
  const fundingRepository = new CapturingFundingRepository();
  const bodyScope = await handlePlayerStorePublicRequest(
    createPlayerStoreRequest("POST", "/players/me/store/quotes", {
      offerKey: `sof_${"1".repeat(32)}`,
      quantity: 1,
      expectedVersion: 2,
      gameSessionId: GAME_ID,
    }),
    { kind: "quotes" },
    createPlayerStoreHandlerDependencies(
      repository,
      new CapturingOfferRepository(),
      fundingRepository,
    ),
  );
  const queryScope = await handlePlayerStorePublicRequest(
    createPlayerStoreRequest(
      "GET",
      "/players/me/store/items?gameSessionId=anything",
    ),
    { kind: "items" },
    createPlayerStoreHandlerDependencies(repository),
  );
  const headerScope = await handlePlayerStorePublicRequest(
    createPlayerStoreRequest("GET", "/players/me/store/items", undefined, {
      "x-player-id": PLAYER_ID,
    }),
    { kind: "items" },
    createPlayerStoreHandlerDependencies(repository),
  );

  await assertError(bodyScope, 400, "invalid_player_store_request");
  await assertError(queryScope, 400, "invalid_player_store_request");
  await assertError(headerScope, 400, "invalid_player_store_request");
  assertEquals(fundingRepository.seededQuoteInputs.length, 0);
});
