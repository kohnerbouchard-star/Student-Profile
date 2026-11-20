import {
  cancelPriceTimeBookOrder,
  createPriceTimeOrderBook,
  type PriceTimeBookOrder,
  replacePriceTimeBookOrder,
} from "./priceTimeOrderBookStateMachine.ts";
import {
  admitOrderWithReservation,
  calculateOrderFees,
  cancelOrder,
  expireOrder,
  fillOrderAtTick,
  type OrderReservationSubmission,
} from "./orderReservationStateMachine.ts";
import * as contracts from "../contracts/financialMarketContracts.ts";

declare const Deno: { test(name: string, fn: () => void): void };
import {
  book,
  context,
  equal,
  fill,
  later,
  order,
  policy,
  rules,
  submission,
  throws,
  time,
} from "./marketOrderCharacterizationFixtures.ts";

Deno.test("characterization: matching preserves lexical ties, maker price, digest and input objects", () => {
  const input = book([
    order("b", "buyer-b", "buy"),
    order("a", "buyer-a", "buy"),
    order("z", "seller", "sell", "3", "9"),
  ]);
  const before = JSON.stringify(input);
  const result = createPriceTimeOrderBook(input);
  equal(
    result.trades.map(
      (t) => [
        t.buyOrderPublicId,
        t.quantity,
        t.executionPrice,
        t.makerOrderPublicId,
      ],
    ),
    [["a", "2", "10", "a"], ["b", "1", "10", "b"]],
  );
  equal(
    result.orders.map(
      (o) => [
        o.orderPublicId,
        o.remainingQuantity,
        o.filledQuantity,
        o.status,
        o.version,
      ],
    ),
    [["a", "0", "2", "filled", 2], ["b", "1", "1", "partially_filled", 2], [
      "z",
      "0",
      "3",
      "filled",
      3,
    ]],
  );
  equal(result.deterministicDigest, "0sc118g");
  equal(result.trades.map((t) => t.tradePublicId), [
    "market-trade.0n7hosz.v1",
    "market-trade.1dcr6yr.v1",
  ]);
  equal(JSON.stringify(input), before);
  equal(
    createPriceTimeOrderBook({ ...input, orders: [...input.orders].reverse() }),
    result,
  );
});
Deno.test("characterization: self-cross is recorded and unrelated liquidity fills", () => {
  const result = createPriceTimeOrderBook(
    book([
      order("a", "self", "buy"),
      order("b", "self", "sell", "2", "9"),
      order("c", "other", "sell", "1", "9"),
    ]),
  );
  equal(result.blockedSelfTradePairKeys, ["a|b"]);
  equal(result.trades.map((t) => [t.sellOrderPublicId, t.quantity]), [[
    "c",
    "1",
  ]]);
  equal(result.executableCrossRemaining, false);
});
Deno.test("characterization: replacement and cancellation preserve cash deltas and terminal metadata", () => {
  const initial = createPriceTimeOrderBook(book([order("a", "buyer", "buy")]));
  const before = JSON.stringify(initial);
  const replaced = replacePriceTimeBookOrder(initial, {
    expectedBookVersion: 1,
    transitionKey: "replace",
    now: later,
    orderPublicId: "a",
    replacementOrderPublicId: "b",
    replacementReservationPublicId: "reserve.b.v1",
    replacementQuantity: "1",
    replacementLimitPrice: "12",
    replacementPrioritySequence: 2,
  }, policy);
  equal(replaced.reservationDelta, {
    releasedCash: "8",
    additionalCashRequired: "0",
    releasedAssetQuantity: "0",
    additionalAssetQuantityRequired: "0",
  });
  equal(
    replaced.state.orders.map(
      (o) => [o.orderPublicId, o.status, o.replacedByOrderPublicId],
    ),
    [["a", "replaced", "b"], ["b", "open", null]],
  );
  const cancelled = cancelPriceTimeBookOrder(replaced.state, {
    expectedBookVersion: 2,
    transitionKey: "cancel",
    now: later,
    orderPublicId: "b",
  });
  equal(cancelled.reservationDelta.releasedCash, "12");
  equal(cancelled.state.processedTransitionKeys, ["cancel", "replace"]);
  equal(JSON.stringify(initial), before);
  throws(
    () =>
      cancelPriceTimeBookOrder(cancelled.state, {
        expectedBookVersion: 3,
        transitionKey: "cancel",
        now: "bad",
        orderPublicId: "b",
      }),
    "order_book_duplicate_transition",
  );
});
for (
  const [name, mutate, expected] of [
    [
      "policy before identity",
      (x: ReturnType<typeof book>) => ({
        ...x,
        bookPublicId: "",
        policy: { ...policy, shortSellingSupported: true as false },
      }),
      "order_book_policy_invalid",
    ],
    [
      "book identity",
      (x: ReturnType<typeof book>) => ({
        ...x,
        bookPublicId: "",
        quotationCurrencyCode: "bad",
      }),
      "order_book_id_invalid",
    ],
    [
      "currency before time",
      (x: ReturnType<typeof book>) => ({
        ...x,
        quotationCurrencyCode: "bad",
        observedAt: "bad",
      }),
      "order_book_currency_invalid",
    ],
    [
      "precision",
      (x: ReturnType<typeof book>) => ({
        ...x,
        orders: [{ ...order("a", "p", "buy"), originalQuantity: "0.0000001" }],
      }),
      "order_book_amount_precision_invalid",
    ],
    [
      "duplicate order",
      (x: ReturnType<typeof book>) => ({
        ...x,
        orders: [order("a", "p", "buy"), order("a", "p", "buy")],
      }),
      "order_book_duplicate_order_id",
    ],
    [
      "future submission",
      (x: ReturnType<typeof book>) => ({
        ...x,
        orders: [{ ...order("a", "p", "buy"), submittedAt: later }],
      }),
      "order_future_submission",
    ],
  ] as const
) {
  Deno.test(`characterization: order-book ${name}`, () =>
    throws(() => createPriceTimeOrderBook(mutate(book())), expected));
}

Deno.test("characterization: reservation fill preserves exact amounts and input state", () => {
  const initial = admitOrderWithReservation(submission(), context());
  const before = JSON.stringify(initial);
  equal(
    [initial.order.orderPublicId, initial.reservation.reservationPublicId],
    ["order.0lxh1so.v1", "reservation.0lxh1so.cash.v1"],
  );
  equal([
    initial.reservation.originalAmount,
    initial.availableCashAfterReservation,
    initial.order.feeAmountReserved,
  ], ["101.6", "898.4", "1.6"]);
  const result = fillOrderAtTick(initial, fill(), rules());
  equal([
    result.consumedCash,
    result.releasedCash,
    result.grossValue,
    result.feeAmount,
  ], ["96.525", "5.075", "95", "1.525"]);
  equal([
    result.aggregate.aggregateVersion,
    result.aggregate.order.status,
    result.aggregate.reservation.status,
    result.aggregate.order.remainingQuantity,
  ], [2, "filled", "consumed", "0"]);
  equal(JSON.stringify(initial), before);
});
Deno.test("characterization: cancellation and expiry release only the reserved side", () => {
  const buy = admitOrderWithReservation(submission(), context());
  const sell = admitOrderWithReservation(submission("sell"), context());
  const command = {
    expectedAggregateVersion: 1,
    transitionKey: "release",
    now: later,
  };
  const cancelled = cancelOrder(buy, command),
    expired = expireOrder(sell, command);
  equal([
    cancelled.releasedCash,
    cancelled.releasedAssetQuantity,
    cancelled.aggregate.order.status,
  ], ["101.6", "0", "cancelled"]);
  equal([
    expired.releasedCash,
    expired.releasedAssetQuantity,
    expired.aggregate.order.status,
  ], ["0", "10", "expired"]);
  throws(
    () =>
      cancelOrder(cancelled.aggregate, {
        ...command,
        expectedAggregateVersion: 2,
      }),
    "duplicate_transition",
  );
});
for (
  const [name, mutate, expected] of [
    [
      "identity before game",
      (s: OrderReservationSubmission) => ({ ...s, gamePublicId: "" }),
      "gamePublicId_invalid",
    ],
    [
      "currency before digest",
      (s: OrderReservationSubmission) => ({
        ...s,
        quotationCurrencyCode: "bad",
        requestDigestSha256: "bad",
      }),
      "quotation_currency_invalid",
    ],
    [
      "digest before quote",
      (s: OrderReservationSubmission) => ({
        ...s,
        requestDigestSha256: "bad",
        reviewedQuoteVersion: 0,
      }),
      "request_digest_invalid",
    ],
    [
      "quote version",
      (s: OrderReservationSubmission) => ({ ...s, reviewedQuoteVersion: 0 }),
      "quote_version_invalid",
    ],
    [
      "stale quote",
      (s: OrderReservationSubmission) => ({
        ...s,
        staleAfter: "2025-12-31T00:00:00.000Z",
      }),
      "stale_reviewed_quote",
    ],
    [
      "expired admission",
      (s: OrderReservationSubmission) => ({ ...s, expiresAt: time }),
      "order_expiry_invalid",
    ],
    [
      "zero quantity",
      (s: OrderReservationSubmission) => ({ ...s, quantity: "0" }),
      "amount_value_invalid",
    ],
    [
      "minimum quantity",
      (s: OrderReservationSubmission) => ({ ...s, quantity: "0.5" }),
      "quantity_below_minimum",
    ],
    [
      "quantity increment",
      (s: OrderReservationSubmission) => ({ ...s, quantity: "1.5" }),
      "quantity_increment_invalid",
    ],
    [
      "missing limit",
      (s: OrderReservationSubmission) => ({ ...s, limitPrice: null }),
      "limit_price_required",
    ],
    [
      "market limit forbidden",
      (s: OrderReservationSubmission) => ({
        ...s,
        orderType: "market" as const,
      }),
      "market_order_limit_price_not_allowed",
    ],
  ] as const
) {
  Deno.test(`characterization: reservation ${name}`, () =>
    throws(
      () => admitOrderWithReservation(mutate(submission()), context()),
      expected,
    ));
}
for (
  const [name, mutate, expected] of [
    [
      "stale envelope first",
      () => ({
        ...fill(),
        expectedAggregateVersion: 0,
        transitionKey: "",
        gameStatus: "ended" as const,
      }),
      "stale_aggregate_version",
    ],
    [
      "game before market",
      () => ({ ...fill(), gameStatus: "ended" as const, marketPaused: true }),
      "game_ended",
    ],
    [
      "paused before exchange",
      () => ({ ...fill(), marketPaused: true, exchangeOpen: false }),
      "market_paused",
    ],
    [
      "quote version before quantity",
      () => ({ ...fill(), quoteVersion: 8, fillQuantity: "0" }),
      "stale_quote_version",
    ],
    [
      "partial fills disabled",
      () => ({ ...fill(), fillQuantity: "5" }),
      "partial_fills_disabled",
    ],
    [
      "buy limit",
      () => ({ ...fill(), executionPrice: "10.01" }),
      "buy_limit_not_satisfied",
    ],
  ] as const
) {
  Deno.test(`characterization: fill ${name}`, () =>
    throws(() =>
      fillOrderAtTick(
        admitOrderWithReservation(submission(), context()),
        mutate(),
        rules(),
      ), expected));
}
Deno.test("characterization: policy validation precedes fee inputs", () => {
  throws(
    () =>
      calculateOrderFees("bad", {
        ...rules(),
        shortSellingSupported: true as false,
      }),
    "unsupported_trading_feature_enabled",
  );
  throws(
    () =>
      calculateOrderFees("bad", { ...rules(), transactionFeeRate: Infinity }),
    "fee_policy_invalid",
  );
  equal(calculateOrderFees("0", rules()), "0.1");
  equal(calculateOrderFees("0.000001", rules()), "0.1");
});
Deno.test("characterization: financial contract runtime exports and public-ID bounds stay exact", () => {
  equal(Object.keys(contracts).sort(), [
    "FINANCIAL_MARKET_CONTRACT_VERSION",
    "FINANCIAL_MARKET_PUBLIC_ID_PATTERN",
    "assertFinancialMarketPublicId",
    "isFinancialMarketPublicId",
  ]);
  equal(contracts.FINANCIAL_MARKET_CONTRACT_VERSION, "financial-markets.v1");
  for (const value of ["asset.test.v1", `a.${"x".repeat(155)}.v1`]) {
    equal(contracts.isFinancialMarketPublicId(value), true);
  }
  for (
    const value of [
      null,
      "",
      "Asset.test.v1",
      "asset.test.v0",
      "asset..test.v1",
      `a.${"x".repeat(156)}.v1`,
      " asset.test.v1",
    ]
  ) equal(contracts.isFinancialMarketPublicId(value), false);
  throws(
    () => contracts.assertFinancialMarketPublicId("bad", "asset"),
    "asset must be a valid financial-market public ID.",
  );
});
