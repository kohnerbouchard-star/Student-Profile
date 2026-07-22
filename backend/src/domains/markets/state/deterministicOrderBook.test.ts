import {
  type FinancialInstrumentBookOrder,
  runDeterministicFinancialOrderBook,
} from "./deterministicOrderBook.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test(
  "order book uses price-time priority and maker-limit execution",
  () => {
    const snapshot = runDeterministicFinancialOrderBook([
      order(
        "sell-1",
        "seller",
        "sell",
        "10",
        "49",
        "2026-07-22T00:00:00.000Z",
        1,
      ),
      order(
        "buy-late",
        "buyer-b",
        "buy",
        "10",
        "52",
        "2026-07-22T00:00:02.000Z",
        3,
      ),
      order(
        "buy-early",
        "buyer-a",
        "buy",
        "10",
        "52",
        "2026-07-22T00:00:01.000Z",
        2,
      ),
    ], context());
    assertEquals(snapshot.matches.length, 1);
    assertEquals(snapshot.matches[0].buyOrderPublicId, "buy-early");
    assertEquals(snapshot.matches[0].executionPrice, "49");
    assertEquals(snapshot.matches[0].makerOrderPublicId, "sell-1");
    assertEquals(snapshot.matches[0].grossValue, "490");
    assertEquals(snapshot.unmatchedOrderPublicIds, ["buy-late"]);
  },
);

Deno.test(
  "whole-order matching skips unequal quantities instead of partially filling",
  () => {
    const snapshot = runDeterministicFinancialOrderBook([
      order(
        "buy-20",
        "buyer",
        "buy",
        "20",
        "55",
        "2026-07-22T00:00:01.000Z",
        1,
      ),
      order(
        "sell-10",
        "seller-a",
        "sell",
        "10",
        "50",
        "2026-07-22T00:00:00.000Z",
        2,
      ),
      order(
        "sell-20",
        "seller-b",
        "sell",
        "20",
        "51",
        "2026-07-22T00:00:02.000Z",
        3,
      ),
    ], context());
    assertEquals(snapshot.matches.length, 1);
    assertEquals(snapshot.matches[0].sellOrderPublicId, "sell-20");
    assertEquals(snapshot.unmatchedOrderPublicIds, ["sell-10"]);
    assertEquals(snapshot.partialFillSupported, false);
  },
);

Deno.test(
  "self-trade pairs are blocked without hiding other eligible liquidity",
  () => {
    const snapshot = runDeterministicFinancialOrderBook([
      order(
        "buy-self",
        "player-a",
        "buy",
        "10",
        "60",
        "2026-07-22T00:00:01.000Z",
        1,
      ),
      order(
        "sell-self",
        "player-a",
        "sell",
        "10",
        "50",
        "2026-07-22T00:00:00.000Z",
        2,
      ),
      order(
        "sell-other",
        "player-b",
        "sell",
        "10",
        "51",
        "2026-07-22T00:00:02.000Z",
        3,
      ),
    ], context());
    assertEquals(snapshot.matches[0].sellOrderPublicId, "sell-other");
    assertEquals(snapshot.selfTradeBlockedPairKeys, [
      "buy-self|sell-self",
    ]);
  },
);

Deno.test("order-book output is invariant to input ordering", () => {
  const orders = [
    order(
      "buy-a",
      "buyer",
      "buy",
      "10",
      "52",
      "2026-07-22T00:00:01.000Z",
      1,
    ),
    order(
      "sell-a",
      "seller",
      "sell",
      "10",
      "50",
      "2026-07-22T00:00:00.000Z",
      2,
    ),
    order(
      "expired",
      "seller-x",
      "sell",
      "10",
      "49",
      "2026-07-21T00:00:00.000Z",
      3,
      "2026-07-21T23:00:00.000Z",
    ),
  ];
  const first = runDeterministicFinancialOrderBook(orders, context());
  const second = runDeterministicFinancialOrderBook(
    [...orders].reverse(),
    context(),
  );
  assertEquals(first, second);
  assertEquals(first.expiredOrderPublicIds, ["expired"]);
});

Deno.test(
  "order book rejects mixed scope, invalid increments, and physical settlement",
  () => {
    assertThrows(
      () =>
        runDeterministicFinancialOrderBook([
          {
            ...order(
              "bad-scope",
              "buyer",
              "buy",
              "10",
              "50",
              "2026-07-22T00:00:00.000Z",
              1,
            ),
            listingPublicId: "listing.other.v1",
          },
        ], context()),
      "order_book_mixed_market_scope",
    );
    assertThrows(
      () =>
        runDeterministicFinancialOrderBook([
          order(
            "bad-increment",
            "buyer",
            "buy",
            "10.5",
            "50",
            "2026-07-22T00:00:00.000Z",
            1,
          ),
        ], context()),
      "order_book_quantity_increment_invalid",
    );
    assertThrows(
      () =>
        runDeterministicFinancialOrderBook([], {
          ...context(),
          marketplacePhysicalItemSettlementSupported: true as false,
        }),
      "order_book_settlement_domain_invalid",
    );
  },
);

Deno.test("duplicate order and reservation identities fail closed", () => {
  const first = order(
    "duplicate",
    "buyer",
    "buy",
    "10",
    "50",
    "2026-07-22T00:00:00.000Z",
    1,
  );
  assertThrows(
    () =>
      runDeterministicFinancialOrderBook([
        first,
        { ...first, playerPublicId: "other" },
      ], context()),
    "order_book_duplicate_order_id",
  );
  assertThrows(
    () =>
      runDeterministicFinancialOrderBook([
        first,
        {
          ...order(
            "other",
            "seller",
            "sell",
            "10",
            "49",
            "2026-07-22T00:00:01.000Z",
            2,
          ),
          reservationPublicId: first.reservationPublicId,
        },
      ], context()),
    "order_book_duplicate_reservation_id",
  );
});

function context() {
  return {
    listingPublicId: "listing.northreach.exchange.0001.v1",
    instrumentPublicId: "instrument.northreach.common_equity.0001.v1",
    quotationCurrencyCode: "NRC",
    now: "2026-07-22T00:01:00.000Z",
    gameStatus: "active" as const,
    marketPaused: false,
    exchangeOpen: true,
    listingActive: true,
    instrumentActive: true,
    quantityIncrement: "1",
    priceIncrement: "0.01",
    partialFillSupported: false as const,
    shortSellingSupported: false as const,
    settlementDomain: "financial_instrument" as const,
    marketplacePhysicalItemSettlementSupported: false as const,
  };
}

function order(
  orderPublicId: string,
  playerPublicId: string,
  side: "buy" | "sell",
  quantity: string,
  limitPrice: string,
  submittedAt: string,
  sequence: number,
  expiresAt: string | null = null,
): FinancialInstrumentBookOrder {
  return {
    orderPublicId,
    playerPublicId,
    reservationPublicId: `reservation.${orderPublicId}.v1`,
    listingPublicId: "listing.northreach.exchange.0001.v1",
    instrumentPublicId: "instrument.northreach.common_equity.0001.v1",
    quotationCurrencyCode: "NRC",
    side,
    orderType: "limit",
    quantity,
    limitPrice,
    submittedAt,
    sequence,
    expiresAt,
    status: "open",
    reservationKind: side === "buy" ? "cash" : "asset",
    partialFillSupported: false,
  };
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`,
    );
  }
}

function assertThrows(run: () => unknown, expectedMessage: string): void {
  try {
    run();
  } catch (error) {
    if (error instanceof Error && error.message.includes(expectedMessage)) return;
    throw error;
  }
  throw new Error(`Expected error containing ${expectedMessage}.`);
}
