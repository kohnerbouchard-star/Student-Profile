import {
  admitOrderWithReservation,
  calculateOrderFees,
  cancelOrder,
  expireOrder,
  fillOrderAtTick,
} from "./orderReservationStateMachine.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("buy order reserves cash once and full fill consumes one reservation", () => {
  const aggregate = admitOrderWithReservation(submission("buy"), context());
  assertEquals(aggregate.reservation.kind, "cash");
  assertEquals(aggregate.reservation.originalAmount, "101.6");
  assertEquals(aggregate.availableCashAfterReservation, "898.4");
  const result = fillOrderAtTick(aggregate, {
    expectedAggregateVersion: 1,
    transitionKey: "fill-1",
    now: "2026-01-01T09:01:00.000Z",
    quoteVersion: 7,
    executionPrice: "10",
    fillQuantity: "10",
    quoteObservedAt: "2026-01-01T09:00:30.000Z",
    quoteStaleAfter: "2026-01-01T09:02:00.000Z",
    gameStatus: "active",
    marketPaused: false,
    exchangeOpen: true,
  }, rules());
  assertEquals(result.aggregate.order.status, "filled");
  assertEquals(result.aggregate.reservation.status, "consumed");
  assertEquals(result.consumedCash, "101.6");
  assertEquals(result.releasedCash, "0");
  assertEquals(result.aggregate.order.filledQuantity, "10");
  assertThrows(() =>
    fillOrderAtTick(result.aggregate, {
      expectedAggregateVersion: 2,
      transitionKey: "fill-duplicate",
      now: "2026-01-01T09:01:01.000Z",
      quoteVersion: 7,
      executionPrice: "10",
      fillQuantity: "10",
      quoteObservedAt: "2026-01-01T09:00:30.000Z",
      quoteStaleAfter: "2026-01-01T09:02:00.000Z",
      gameStatus: "active",
      marketPaused: false,
      exchangeOpen: true,
    }, rules())
  );
});

Deno.test("sell order prevents double asset use and short selling", () => {
  const aggregate = admitOrderWithReservation(
    submission("sell"),
    context({ availableAssetQuantity: "10" }),
  );
  assertEquals(aggregate.reservation.kind, "asset");
  assertEquals(aggregate.availableAssetQuantityAfterReservation, "0");
  assertThrows(() =>
    admitOrderWithReservation(
      { ...submission("sell"), idempotencyKey: "sell-2" },
      context({ availableAssetQuantity: aggregate.availableAssetQuantityAfterReservation }),
    )
  );
  assertThrows(() =>
    admitOrderWithReservation(
      submission("sell"),
      context({ tradingRules: { ...rules(), shortSellingSupported: true as never } }),
    )
  );
});

Deno.test("cancellation and expiry release exactly once", () => {
  const buy = admitOrderWithReservation(submission("buy"), context());
  const cancelled = cancelOrder(buy, {
    expectedAggregateVersion: 1,
    transitionKey: "cancel-1",
    now: "2026-01-01T09:01:00.000Z",
  });
  assertEquals(cancelled.releasedCash, buy.reservation.originalAmount);
  assertEquals(cancelled.aggregate.reservation.status, "released");
  assertThrows(() =>
    cancelOrder(cancelled.aggregate, {
      expectedAggregateVersion: 2,
      transitionKey: "cancel-2",
      now: "2026-01-01T09:01:01.000Z",
    })
  );

  const sell = admitOrderWithReservation(
    submission("sell"),
    context({ availableAssetQuantity: "10" }),
  );
  const expired = expireOrder(sell, {
    expectedAggregateVersion: 1,
    transitionKey: "expire-1",
    now: "2026-01-01T10:00:00.000Z",
  });
  assertEquals(expired.releasedAssetQuantity, "10");
  assertThrows(() =>
    expireOrder(expired.aggregate, {
      expectedAggregateVersion: 2,
      transitionKey: "expire-2",
      now: "2026-01-01T10:00:01.000Z",
    })
  );
});

Deno.test("fill and cancel concurrency has one valid outcome", () => {
  const aggregate = admitOrderWithReservation(submission("buy"), context());
  const filled = fillOrderAtTick(aggregate, fillCommand(1, "race-fill"), rules());
  assertThrows(() =>
    cancelOrder(filled.aggregate, {
      expectedAggregateVersion: 1,
      transitionKey: "race-cancel",
      now: "2026-01-01T09:01:01.000Z",
    })
  );

  const cancelled = cancelOrder(aggregate, {
    expectedAggregateVersion: 1,
    transitionKey: "race-cancel-first",
    now: "2026-01-01T09:01:00.000Z",
  });
  assertThrows(() =>
    fillOrderAtTick(cancelled.aggregate, fillCommand(1, "race-fill-second"), rules())
  );
});

Deno.test("stale quote, duplicate transition, and partial fill fail closed", () => {
  const aggregate = admitOrderWithReservation(submission("buy"), context());
  assertThrows(() =>
    fillOrderAtTick(aggregate, {
      ...fillCommand(1, "stale"),
      quoteVersion: 8,
    }, rules())
  );
  assertThrows(() =>
    fillOrderAtTick(aggregate, {
      ...fillCommand(1, "stale-time"),
      now: "2026-01-01T09:03:00.000Z",
    }, rules())
  );
  assertThrows(() =>
    fillOrderAtTick(aggregate, {
      ...fillCommand(1, "partial"),
      fillQuantity: "5",
    }, rules())
  );
  const cancelled = cancelOrder(aggregate, {
    expectedAggregateVersion: 1,
    transitionKey: "duplicate-transition",
    now: "2026-01-01T09:01:00.000Z",
  });
  assertThrows(() =>
    expireOrder(cancelled.aggregate, {
      expectedAggregateVersion: 2,
      transitionKey: "duplicate-transition",
      now: "2026-01-01T09:02:00.000Z",
    })
  );
});

Deno.test("exchange, pause, ended game, inactive listing, and increments fail closed", () => {
  for (const override of [
    { exchangeOpen: false },
    { marketPaused: true },
    { gameStatus: "ended" as const },
    { instrumentActive: false },
    { listingActive: false },
  ]) {
    assertThrows(() => admitOrderWithReservation(submission("buy"), context(override)));
  }
  assertThrows(() =>
    admitOrderWithReservation(
      { ...submission("buy"), quantity: "10.25" },
      context(),
    )
  );
  assertThrows(() =>
    admitOrderWithReservation(
      { ...submission("buy"), reviewedPrice: "10.005" },
      context(),
    )
  );
});

Deno.test("limit orders enforce price and stable reservation identity", () => {
  const limitSubmission = {
    ...submission("buy"),
    orderType: "limit" as const,
    limitPrice: "9.5",
  };
  const first = admitOrderWithReservation(limitSubmission, context());
  const second = admitOrderWithReservation(limitSubmission, context());
  assertEquals(first.order.orderPublicId, second.order.orderPublicId);
  assertEquals(first.reservation.reservationPublicId, second.reservation.reservationPublicId);
  assertThrows(() =>
    fillOrderAtTick(first, {
      ...fillCommand(1, "limit-breach"),
      executionPrice: "10",
    }, rules())
  );
  const filled = fillOrderAtTick(first, {
    ...fillCommand(1, "limit-fill"),
    executionPrice: "9.5",
  }, rules());
  assertEquals(filled.aggregate.order.status, "filled");
});

Deno.test("fees are deterministic and precision is bounded", () => {
  assertEquals(calculateOrderFees("100", rules()), "1.6");
  assertThrows(() => calculateOrderFees("0.0000001", rules()));
  assertThrows(() =>
    calculateOrderFees("100", {
      ...rules(),
      transactionFeeRate: 0.200001,
    })
  );
});

function submission(side: "buy" | "sell") {
  return {
    gamePublicId: "game.market.order.v1",
    playerPublicId: "player.market.order.v1",
    listingPublicId: "listing.northreach.asset.v1",
    instrumentPublicId: "instrument.northreach.asset.v1",
    quotationCurrencyCode: "NRC",
    side,
    orderType: "market" as const,
    quantity: "10",
    limitPrice: null,
    reviewedPrice: "10",
    reviewedQuoteVersion: 7,
    reviewedAt: "2026-01-01T09:00:00.000Z",
    staleAfter: "2026-01-01T09:02:00.000Z",
    expiresAt: "2026-01-01T10:00:00.000Z",
    idempotencyKey: `${side}-1`,
    requestDigestSha256: "e".repeat(64),
  } as const;
}

function context(overrides = {}) {
  return {
    now: "2026-01-01T09:00:30.000Z",
    gameStatus: "active" as const,
    marketPaused: false,
    exchangeOpen: true,
    instrumentActive: true,
    listingActive: true,
    availableCash: "1000",
    availableAssetQuantity: "100",
    tradingRules: rules(),
    ...overrides,
  };
}

function rules() {
  return {
    minimumOrderQuantity: "1",
    quantityIncrement: "1",
    priceIncrement: "0.01",
    transactionFeeRate: 0.01,
    exchangeFeeRate: 0.005,
    fixedFee: "0.1",
    shortSellingSupported: false as const,
    partialFillSupported: false as const,
  };
}

function fillCommand(expectedAggregateVersion: number, transitionKey: string) {
  return {
    expectedAggregateVersion,
    transitionKey,
    now: "2026-01-01T09:01:00.000Z",
    quoteVersion: 7,
    executionPrice: "10",
    fillQuantity: "10",
    quoteObservedAt: "2026-01-01T09:00:30.000Z",
    quoteStaleAfter: "2026-01-01T09:02:00.000Z",
    gameStatus: "active" as const,
    marketPaused: false,
    exchangeOpen: true,
  };
}

function assert(condition: unknown): asserts condition {
  if (!condition) throw new Error("Assertion failed");
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

function assertThrows(run: () => unknown): void {
  let threw = false;
  try {
    run();
  } catch {
    threw = true;
  }
  if (!threw) throw new Error("Expected function to throw.");
}
