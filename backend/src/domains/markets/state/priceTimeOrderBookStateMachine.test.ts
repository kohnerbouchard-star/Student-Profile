import {
  cancelPriceTimeBookOrder,
  createPriceTimeOrderBook,
  replacePriceTimeBookOrder,
  type PriceTimeBookOrder,
} from "./priceTimeOrderBookStateMachine.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("partial fills consume price-time liquidity deterministically", () => {
  const state = createPriceTimeOrderBook({
    ...baseInput(),
    orders: [
      order(
        "buy",
        "buyer",
        "buy",
        "25",
        "55",
        "2026-07-22T01:00:02.000Z",
        3,
      ),
      order(
        "sell-a",
        "seller-a",
        "sell",
        "10",
        "50",
        "2026-07-22T01:00:00.000Z",
        1,
      ),
      order(
        "sell-b",
        "seller-b",
        "sell",
        "20",
        "51",
        "2026-07-22T01:00:01.000Z",
        2,
      ),
    ],
  });
  assertEquals(
    state.trades.map((trade) => [
      trade.sellOrderPublicId,
      trade.quantity,
      trade.executionPrice,
    ]),
    [
      ["sell-a", "10", "50"],
      ["sell-b", "15", "51"],
    ],
  );
  assertEquals(find(state, "buy").status, "filled");
  assertEquals(find(state, "sell-b").remainingQuantity, "5");
  assertEquals(find(state, "sell-b").status, "partially_filled");
  assertEquals(state.executableCrossRemaining, false);
});

Deno.test("matching is invariant to input ordering", () => {
  const orders = [
    order(
      "buy-a",
      "buyer-a",
      "buy",
      "10",
      "52",
      "2026-07-22T01:00:02.000Z",
      3,
    ),
    order(
      "buy-b",
      "buyer-b",
      "buy",
      "10",
      "52",
      "2026-07-22T01:00:03.000Z",
      4,
    ),
    order(
      "sell-a",
      "seller-a",
      "sell",
      "15",
      "50",
      "2026-07-22T01:00:00.000Z",
      1,
    ),
    order(
      "sell-b",
      "seller-b",
      "sell",
      "5",
      "51",
      "2026-07-22T01:00:01.000Z",
      2,
    ),
  ];
  const forward = createPriceTimeOrderBook({ ...baseInput(), orders });
  const reverse = createPriceTimeOrderBook({
    ...baseInput(),
    orders: [...orders].reverse(),
  });
  assertEquals(forward, reverse);
});

Deno.test(
  "self-trades are blocked while unrelated crossed liquidity executes",
  () => {
    const state = createPriceTimeOrderBook({
      ...baseInput(),
      orders: [
        order(
          "buy-self",
          "player-a",
          "buy",
          "10",
          "60",
          "2026-07-22T01:00:00.000Z",
          1,
        ),
        order(
          "sell-self",
          "player-a",
          "sell",
          "5",
          "49",
          "2026-07-22T01:00:01.000Z",
          2,
        ),
        order(
          "sell-other",
          "player-b",
          "sell",
          "10",
          "50",
          "2026-07-22T01:00:02.000Z",
          3,
        ),
      ],
    });
    assertEquals(state.trades[0].sellOrderPublicId, "sell-other");
    assertEquals(state.blockedSelfTradePairKeys, ["buy-self|sell-self"]);
    assertEquals(state.executableCrossRemaining, false);
  },
);

Deno.test(
  "replacement resets priority and releases excess buy reservation",
  () => {
    const initial = createPriceTimeOrderBook({
      ...baseInput(),
      orders: [
        order(
          "buy",
          "buyer",
          "buy",
          "10",
          "50",
          "2026-07-22T01:00:00.000Z",
          1,
        ),
      ],
    });
    const result = replacePriceTimeBookOrder(initial, {
      expectedBookVersion: 1,
      transitionKey: "replace-1",
      now: "2026-07-22T01:04:00.000Z",
      orderPublicId: "buy",
      replacementOrderPublicId: "buy-r1",
      replacementReservationPublicId: "reservation.buy-r1.v1",
      replacementQuantity: "8",
      replacementLimitPrice: "45",
      replacementPrioritySequence: 9,
    }, policy());
    assertEquals(result.reservationDelta.releasedCash, "140");
    assertEquals(find(result.state, "buy").status, "replaced");
    assertEquals(
      find(result.state, "buy").replacedByOrderPublicId,
      "buy-r1",
    );
    assertEquals(
      find(result.state, "buy-r1").submittedAt,
      "2026-07-22T01:04:00.000Z",
    );
  },
);

Deno.test(
  "replacement reports additional sell reservation requirement",
  () => {
    const initial = createPriceTimeOrderBook({
      ...baseInput(),
      orders: [
        order(
          "sell",
          "seller",
          "sell",
          "5",
          "60",
          "2026-07-22T01:00:00.000Z",
          1,
        ),
      ],
    });
    const result = replacePriceTimeBookOrder(initial, {
      expectedBookVersion: 1,
      transitionKey: "replace-sell",
      now: "2026-07-22T01:04:00.000Z",
      orderPublicId: "sell",
      replacementOrderPublicId: "sell-r1",
      replacementReservationPublicId: "reservation.sell-r1.v1",
      replacementQuantity: "9",
      replacementLimitPrice: "59",
      replacementPrioritySequence: 2,
    }, policy());
    assertEquals(
      result.reservationDelta.additionalAssetQuantityRequired,
      "4",
    );
  },
);

Deno.test("cancellation releases only the unfilled reservation", () => {
  const initial = createPriceTimeOrderBook({
    ...baseInput(),
    orders: [
      order(
        "buy",
        "buyer",
        "buy",
        "10",
        "50",
        "2026-07-22T01:00:01.000Z",
        2,
      ),
      order(
        "sell",
        "seller",
        "sell",
        "4",
        "49",
        "2026-07-22T01:00:00.000Z",
        1,
      ),
    ],
  });
  assertEquals(find(initial, "buy").remainingQuantity, "6");
  const cancelled = cancelPriceTimeBookOrder(initial, {
    expectedBookVersion: 1,
    transitionKey: "cancel-buy",
    now: "2026-07-22T01:05:00.000Z",
    orderPublicId: "buy",
  });
  assertEquals(cancelled.reservationDelta.releasedCash, "300");
  assertEquals(find(cancelled.state, "buy").status, "cancelled");
});

Deno.test("terminal, stale-version, and replay transitions fail closed", () => {
  const initial = createPriceTimeOrderBook({
    ...baseInput(),
    orders: [
      order(
        "buy",
        "buyer",
        "buy",
        "5",
        "50",
        "2026-07-22T01:00:00.000Z",
        1,
      ),
    ],
  });
  const cancelled = cancelPriceTimeBookOrder(initial, {
    expectedBookVersion: 1,
    transitionKey: "cancel",
    now: "2026-07-22T01:04:00.000Z",
    orderPublicId: "buy",
  });
  assertThrows(
    () =>
      cancelPriceTimeBookOrder(cancelled.state, {
        expectedBookVersion: 2,
        transitionKey: "cancel-again",
        now: "2026-07-22T01:05:00.000Z",
        orderPublicId: "buy",
      }),
    "order_not_cancellable",
  );
  assertThrows(
    () =>
      cancelPriceTimeBookOrder(initial, {
        expectedBookVersion: 2,
        transitionKey: "stale",
        now: "2026-07-22T01:04:00.000Z",
        orderPublicId: "buy",
      }),
    "order_book_stale_version",
  );
  assertThrows(
    () =>
      cancelPriceTimeBookOrder(cancelled.state, {
        expectedBookVersion: 2,
        transitionKey: "cancel",
        now: "2026-07-22T01:05:00.000Z",
        orderPublicId: "buy",
      }),
    "order_book_duplicate_transition",
  );
});

Deno.test(
  "policy rejects short selling and Marketplace settlement coupling",
  () => {
    assertThrows(
      () =>
        createPriceTimeOrderBook({
          ...baseInput(),
          policy: {
            ...policy(),
            shortSellingSupported: true as false,
          },
        }),
      "order_book_policy_invalid",
    );
    assertThrows(
      () =>
        createPriceTimeOrderBook({
          ...baseInput(),
          policy: {
            ...policy(),
            marketplacePhysicalItemSettlementSupported: true as false,
          },
        }),
      "order_book_settlement_domain_invalid",
    );
  },
);

function baseInput() {
  return {
    bookPublicId: "order-book.northreach.exchange.0001.v1",
    listingPublicId: "listing.northreach.exchange.0001.v1",
    instrumentPublicId: "instrument.northreach.common_equity.0001.v1",
    quotationCurrencyCode: "NRC",
    observedAt: "2026-07-22T01:03:00.000Z",
    orders: [] as PriceTimeBookOrder[],
    policy: policy(),
  };
}

function policy() {
  return {
    quantityIncrement: "1",
    priceIncrement: "0.01",
    partialFillSupported: true as const,
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
  prioritySequence: number,
): PriceTimeBookOrder {
  return {
    orderPublicId,
    reservationPublicId: `reservation.${orderPublicId}.v1`,
    playerPublicId,
    side,
    originalQuantity: quantity,
    remainingQuantity: quantity,
    filledQuantity: "0",
    limitPrice,
    submittedAt,
    prioritySequence,
    version: 1,
    status: "open",
    terminalAt: null,
    replacedByOrderPublicId: null,
  };
}

function find(
  state: { readonly orders: readonly PriceTimeBookOrder[] },
  id: string,
): PriceTimeBookOrder {
  const found = state.orders.find((order) => order.orderPublicId === id);
  if (!found) throw new Error(`missing:${id}`);
  return found;
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
