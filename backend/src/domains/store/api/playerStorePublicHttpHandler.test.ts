import { handlePlayerStorePublicRequest } from "./playerStorePublicHttpHandler.ts";
import {
  playerStoreRouteRateLimitKey,
  readPlayerStorePublicRoutePath,
} from "./playerStorePublicRoutePaths.ts";
import {
  assertEquals,
  assertError,
  assertNoInternalFields,
  assertNoUuid,
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
    ["business_offer", "seeded_offer", "unsupported"],
  );
  assertEquals(offerRepository.productInputs, [{
    gameSessionId: GAME_ID,
    playerId: PLAYER_ID,
  }]);
  assertNoUuid(listBody);
  assertNoInternalFields(listBody);

  const quoteResponse = await handlePlayerStorePublicRequest(
    createPlayerStoreRequest("POST", "/players/me/store/quotes", {
      itemKey: "field_permit",
      quantity: 2,
    }),
    { kind: "quotes" },
    createPlayerStoreHandlerDependencies(repository),
  );
  const quoteBody = await quoteResponse.json();

  assertEquals(quoteResponse.status, 200);
  assertEquals(quoteBody.quote.quoteKey, QUOTE_KEY);
  assertEquals(repository.quoteInputs[0], {
    gameSessionId: GAME_ID,
    playerId: PLAYER_ID,
    itemKey: "field_permit",
    quantity: 2,
    nowIso: "2026-07-19T02:00:00.000Z",
  });
  assertNoUuid(quoteBody);
});

Deno.test("Player Store purchase uses session scope and returns public receipt", async () => {
  const repository = new CapturingRepository();
  const response = await handlePlayerStorePublicRequest(
    createPlayerStoreRequest("POST", "/players/me/store/purchases", {
      quoteKey: QUOTE_KEY,
      idempotencyKey: "store.test.12345678",
      clientSubmittedAt: "2026-07-19T02:01:00.000Z",
    }),
    { kind: "purchases" },
    createPlayerStoreHandlerDependencies(repository),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.receipt.receiptKey, RECEIPT_KEY);
  assertEquals(body.receipt.itemKey, "field_permit");
  assertEquals(body.refreshRequired, true);
  assertEquals(repository.purchaseInputs[0], {
    gameSessionId: GAME_ID,
    playerId: PLAYER_ID,
    quoteKey: QUOTE_KEY,
    idempotencyKey: "store.test.12345678",
    clientSubmittedAt: "2026-07-19T02:01:00.000Z",
  });
  assertNoUuid(body);
});

Deno.test("Player Store rejects browser-owned scope and unexpected request fields", async () => {
  const repository = new CapturingRepository();
  const bodyScope = await handlePlayerStorePublicRequest(
    createPlayerStoreRequest("POST", "/players/me/store/quotes", {
      itemKey: "field_permit",
      quantity: 1,
      gameSessionId: GAME_ID,
    }),
    { kind: "quotes" },
    createPlayerStoreHandlerDependencies(repository),
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
  assertEquals(repository.quoteInputs.length, 0);
});
