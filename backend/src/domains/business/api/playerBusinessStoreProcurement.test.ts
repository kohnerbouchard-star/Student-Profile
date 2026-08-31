import {
  createBusinessStoreQuote,
  purchaseBusinessStoreQuote,
  readFundingAllocations,
  toBusinessStoreQuote,
  toBusinessStoreReceipt,
} from "./playerBusinessStoreProcurement.ts";
import { handlePlayerBusinessRequest } from "./playerBusinessHttpHandler.ts";
import {
  assertBusinessError,
  assertEqual,
  assertNoUuid,
  assertThrows,
  BUSINESS_KEY,
  CapturingRepository,
  fundingQuoteLineRow,
  fundingQuoteRow,
  GAME_ID,
  handlerDependencies,
  IDEMPOTENCY_KEY,
  PLAYER_ID,
  QUOTE_KEY,
  quoteRow,
  RECEIPT_KEY,
  receiptRow,
  request,
  RetiredPaymentRepository,
  SOURCE_ACCOUNT_KEY,
  TARGET_ACCOUNT_KEY,
} from "./playerBusinessStoreProcurement.testSupport.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test(
  "Business Store quote derives scope server-side and returns public evidence",
  async () => {
    const repository = new CapturingRepository();
    const quote = await createBusinessStoreQuote(
      repository,
      { gameSessionId: GAME_ID, playerId: PLAYER_ID },
      {
        itemKey: "Steel_Plate",
        quantity: 3,
        allocations: [{
          sourceAccountKey: SOURCE_ACCOUNT_KEY,
          targetAmount: null,
        }],
        idempotencyKey: IDEMPOTENCY_KEY,
      },
    );

    assertEqual(repository.calls[0], {
      command: "create_business_store_quote_v2",
      args: {
        p_game_session_id: GAME_ID,
        p_player_id: PLAYER_ID,
        p_item_key: "steel_plate",
        p_quantity: 3,
        p_allocations: [{
          sourceAccountKey: SOURCE_ACCOUNT_KEY,
          targetAmount: null,
        }],
        p_idempotency_key: IDEMPOTENCY_KEY,
      },
    });
    assertEqual(quote.businessKey, BUSINESS_KEY);
    assertEqual(quote.quoteKey, QUOTE_KEY);
    assertEqual(quote.finalTotalPrice, 30.01);
    assertEqual(quote.finalTotal.amount, "30.01");
    assertEqual(quote.fundingTargetAccountKey, TARGET_ACCOUNT_KEY);
    assertNoUuid(quote);
  },
);

Deno.test(
  "Business Store purchase carries public quote intent and stable receipt evidence",
  async () => {
    const repository = new CapturingRepository();
    const receipt = await purchaseBusinessStoreQuote(
      repository,
      { gameSessionId: GAME_ID, playerId: PLAYER_ID },
      {
        quoteKey: QUOTE_KEY.toUpperCase(),
        idempotencyKey: "business-store-purchase-0001",
        clientSubmittedAt: "2026-08-21T01:00:00Z",
      },
    );

    assertEqual(repository.calls[0], {
      command: "purchase_business_store_quote_v2",
      args: {
        p_game_session_id: GAME_ID,
        p_player_id: PLAYER_ID,
        p_quote_key: QUOTE_KEY,
        p_idempotency_key: "business-store-purchase-0001",
        p_client_submitted_at: "2026-08-21T01:00:00.000Z",
        p_request_metadata: {
          route: "players.me.business.store.purchases.v2",
        },
      },
    });
    assertEqual(receipt.receiptKey, RECEIPT_KEY);
    assertEqual(receipt.warehouseQuantityOwned, 8);
    assertEqual(receipt.warehouseAverageUnitCost, 9.8765);
    assertEqual(
      receipt.fundingReceipt.targetAccountKey,
      TARGET_ACCOUNT_KEY,
    );
    assertEqual(receipt.alreadyCompleted, false);
    assertNoUuid(receipt);
  },
);

Deno.test(
  "Business Store parser rejects malformed intent before repository execution",
  async () => {
    const repository = new CapturingRepository();

    await assertBusinessError(
      () =>
        createBusinessStoreQuote(
          repository,
          { gameSessionId: GAME_ID, playerId: PLAYER_ID },
          {
            itemKey: "not valid",
            quantity: 1,
            allocations: [{
              sourceAccountKey: SOURCE_ACCOUNT_KEY,
              targetAmount: null,
            }],
            idempotencyKey: IDEMPOTENCY_KEY,
          },
        ),
      400,
      "invalid_business_store_request",
    );
    await assertBusinessError(
      () =>
        purchaseBusinessStoreQuote(
          repository,
          { gameSessionId: GAME_ID, playerId: PLAYER_ID },
          {
            quoteKey: `quote_${"d".repeat(32)}`,
            idempotencyKey: IDEMPOTENCY_KEY,
          },
        ),
      400,
      "invalid_business_store_request",
    );
    assertEqual(repository.calls.length, 0);
  },
);

Deno.test(
  "Business Store result adapters fail closed on malformed private output",
  () => {
    assertThrows(() =>
      toBusinessStoreQuote({
        ...quoteRow(),
        quote_key: "00000000-0000-4000-8000-000000000099",
      })
    );
    assertThrows(() =>
      toBusinessStoreReceipt({
        ...receiptRow(),
        warehouse_average_unit_cost: -1,
      })
    );
  },
);

Deno.test(
  "Business Store funding intent preserves order and exact decimals with a final server remainder",
  () => {
    const otherAccountKey = `bac_${"4".repeat(32)}`;
    assertEqual(
      readFundingAllocations([
        {
          sourceAccountKey: SOURCE_ACCOUNT_KEY,
          targetAmount: "99999999999999999999.123456789012345678",
        },
        { sourceAccountKey: otherAccountKey, targetAmount: null },
      ]),
      [
        {
          sourceAccountKey: SOURCE_ACCOUNT_KEY,
          targetAmount: "99999999999999999999.123456789012345678",
        },
        { sourceAccountKey: otherAccountKey, targetAmount: null },
      ],
    );
    assertThrows(() =>
      readFundingAllocations([
        { sourceAccountKey: SOURCE_ACCOUNT_KEY, targetAmount: 10 },
        { sourceAccountKey: otherAccountKey, targetAmount: null },
      ])
    );
    assertThrows(() =>
      readFundingAllocations([
        { sourceAccountKey: SOURCE_ACCOUNT_KEY, targetAmount: "10" },
        { sourceAccountKey: SOURCE_ACCOUNT_KEY, targetAmount: null },
      ])
    );
    assertThrows(() =>
      readFundingAllocations([
        { sourceAccountKey: SOURCE_ACCOUNT_KEY, targetAmount: null },
        { sourceAccountKey: otherAccountKey, targetAmount: "10" },
      ])
    );
    assertThrows(() =>
      readFundingAllocations([{
        sourceAccountKey: SOURCE_ACCOUNT_KEY,
        targetAmount: null,
        amount: "10",
      }])
    );
  },
);

Deno.test(
  "Business Store projections reject broken commercial funding bindings",
  () => {
    assertThrows(() =>
      toBusinessStoreQuote({
        ...quoteRow(),
        funding_quote: {
          ...fundingQuoteRow(),
          funding_context_kind: "store.seeded",
        },
      })
    );
    assertThrows(() =>
      toBusinessStoreQuote({
        ...quoteRow(),
        funding_quote: {
          ...fundingQuoteRow(),
          lines: [{
            ...fundingQuoteLineRow(),
            target_contribution: "30.00",
          }],
        },
      })
    );
    assertThrows(() =>
      toBusinessStoreQuote({
        ...quoteRow(),
        funding_quote: {
          ...fundingQuoteRow(),
          target_amount: "30.02",
        },
      })
    );
    assertThrows(() =>
      toBusinessStoreReceipt({
        ...receiptRow(),
        funding_target_account_key: `bac_${"5".repeat(32)}`,
      })
    );
  },
);

Deno.test(
  "Business Store HTTP routes reject browser scope and expose UUID-free DTOs",
  async () => {
    const repository = new CapturingRepository();
    const dependencies = handlerDependencies(repository);

    const quoteResponse = await handlePlayerBusinessRequest(
      request("/players/me/business/store/quotes", {
        itemKey: "steel_plate",
        quantity: 3,
        allocations: [{
          sourceAccountKey: SOURCE_ACCOUNT_KEY,
          targetAmount: null,
        }],
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
      { kind: "businessStoreQuote" },
      dependencies,
    );
    const quoteBody = await quoteResponse.json();
    assertEqual(quoteResponse.status, 200);
    assertEqual(quoteBody.quote.quoteKey, QUOTE_KEY);
    assertNoUuid(quoteBody);

    const purchaseResponse = await handlePlayerBusinessRequest(
      request("/players/me/business/store/purchases", {
        quoteKey: QUOTE_KEY,
        idempotencyKey: "business-store-purchase-0001",
      }),
      { kind: "businessStorePurchase" },
      dependencies,
    );
    const purchaseBody = await purchaseResponse.json();
    assertEqual(purchaseResponse.status, 200);
    assertEqual(purchaseBody.receipt.receiptKey, RECEIPT_KEY);
    assertEqual(purchaseBody.refreshRequired, true);
    assertNoUuid(purchaseBody);

    const scopeInjectionResponse = await handlePlayerBusinessRequest(
      request("/players/me/business/store/quotes", {
        itemKey: "steel_plate",
        quantity: 1,
        allocations: [{
          sourceAccountKey: SOURCE_ACCOUNT_KEY,
          targetAmount: null,
        }],
        idempotencyKey: "business-store-scope-0001",
        gameSessionId: GAME_ID,
      }),
      { kind: "businessStoreQuote" },
      dependencies,
    );
    assertEqual(scopeInjectionResponse.status, 400);
    assertEqual(repository.calls.length, 2);
  },
);

Deno.test(
  "Business Store HTTP purchase retires unbound pre-C4 payment quotes with stable 410",
  async () => {
    const response = await handlePlayerBusinessRequest(
      request("/players/me/business/store/purchases", {
        quoteKey: QUOTE_KEY,
        idempotencyKey: "business-store-retired-payment-0001",
      }),
      { kind: "businessStorePurchase" },
      handlerDependencies(new RetiredPaymentRepository()),
    );
    const body = await response.json();
    assertEqual(response.status, 410);
    assertEqual(
      body.error.code,
      "business_store_procurement_payment_retired",
    );
  },
);
