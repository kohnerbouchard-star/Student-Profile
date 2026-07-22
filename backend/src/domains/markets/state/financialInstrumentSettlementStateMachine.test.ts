import {
  admitFinancialInstrumentSettlement,
  confirmSettlementAssetReservation,
  confirmSettlementCashReservation,
  failFinancialInstrumentSettlement,
  settleFinancialInstrumentDeliveryVersusPayment,
  type FinancialInstrumentSettlementInstruction,
} from "./financialInstrumentSettlementStateMachine.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test(
  "settlement completes deterministic delivery-versus-payment",
  () => {
    let aggregate = admitFinancialInstrumentSettlement(instruction());
    aggregate = confirmSettlementCashReservation(aggregate, {
      expectedAggregateVersion: 1,
      transitionKey: "cash-reserved",
      reservationPublicId: "reservation.cash.trade-a.v1",
      amount: "1002",
      now: "2026-07-22T00:00:01.000Z",
    });
    aggregate = confirmSettlementAssetReservation(aggregate, {
      expectedAggregateVersion: 2,
      transitionKey: "asset-reserved",
      reservationPublicId: "reservation.asset.trade-a.v1",
      amount: "10",
      now: "2026-07-22T00:00:02.000Z",
    });
    assertEquals(aggregate.status, "ready_for_delivery");
    const result = settleFinancialInstrumentDeliveryVersusPayment(
      aggregate,
      {
        expectedAggregateVersion: 3,
        transitionKey: "settle-dvp",
        now: "2026-07-22T00:05:00.000Z",
      },
    );
    assertEquals(result.aggregate.status, "settled");
    assertEquals(result.effects.buyerCashDebit, "1002");
    assertEquals(result.effects.sellerCashCredit, "999");
    assertEquals(result.effects.feeCredit, "3");
    assertEquals(result.effects.buyerAssetCredit, "10");
    assertEquals(result.effects.marketplacePhysicalItemTransfer, false);
  },
);

Deno.test(
  "reservation confirmation order does not change readiness semantics",
  () => {
    let aggregate = admitFinancialInstrumentSettlement(instruction());
    aggregate = confirmSettlementAssetReservation(aggregate, {
      expectedAggregateVersion: 1,
      transitionKey: "asset-first",
      reservationPublicId: "reservation.asset.trade-a.v1",
      amount: "10",
      now: "2026-07-22T00:00:01.000Z",
    });
    assertEquals(aggregate.status, "pending_reservations");
    aggregate = confirmSettlementCashReservation(aggregate, {
      expectedAggregateVersion: 2,
      transitionKey: "cash-second",
      reservationPublicId: "reservation.cash.trade-a.v1",
      amount: "1002",
      now: "2026-07-22T00:00:02.000Z",
    });
    assertEquals(aggregate.status, "ready_for_delivery");
  },
);

Deno.test(
  "settlement cannot execute before due time or without both legs",
  () => {
    let aggregate = admitFinancialInstrumentSettlement(instruction());
    aggregate = confirmSettlementCashReservation(aggregate, {
      expectedAggregateVersion: 1,
      transitionKey: "cash-only",
      reservationPublicId: "reservation.cash.trade-a.v1",
      amount: "1002",
      now: "2026-07-22T00:00:01.000Z",
    });
    assertThrows(
      () =>
        settleFinancialInstrumentDeliveryVersusPayment(aggregate, {
          expectedAggregateVersion: 2,
          transitionKey: "settle-without-asset",
          now: "2026-07-22T00:05:00.000Z",
        }),
      "settlement_not_ready_for_delivery",
    );
    aggregate = confirmSettlementAssetReservation(aggregate, {
      expectedAggregateVersion: 2,
      transitionKey: "asset-later",
      reservationPublicId: "reservation.asset.trade-a.v1",
      amount: "10",
      now: "2026-07-22T00:00:02.000Z",
    });
    assertThrows(
      () =>
        settleFinancialInstrumentDeliveryVersusPayment(aggregate, {
          expectedAggregateVersion: 3,
          transitionKey: "settle-too-early",
          now: "2026-07-22T00:04:59.000Z",
        }),
      "settlement_due_time_not_reached",
    );
  },
);

Deno.test("failed settlement releases only active reservations", () => {
  let aggregate = admitFinancialInstrumentSettlement(instruction());
  aggregate = confirmSettlementCashReservation(aggregate, {
    expectedAggregateVersion: 1,
    transitionKey: "cash-reserved",
    reservationPublicId: "reservation.cash.trade-a.v1",
    amount: "1002",
    now: "2026-07-22T00:00:01.000Z",
  });
  const result = failFinancialInstrumentSettlement(aggregate, {
    expectedAggregateVersion: 2,
    transitionKey: "fail-asset-timeout",
    now: "2026-07-22T00:06:00.000Z",
    reason: "asset_reservation_timeout",
  });
  assertEquals(result.aggregate.status, "failed");
  assertEquals(result.effects.releasedCash, "1002");
  assertEquals(result.effects.releasedAssetQuantity, "0");
  assertEquals(result.aggregate.cashLeg.status, "released");
});

Deno.test(
  "stale versions, duplicate transitions, and terminal mutation fail closed",
  () => {
    let aggregate = admitFinancialInstrumentSettlement(instruction());
    aggregate = confirmSettlementCashReservation(aggregate, {
      expectedAggregateVersion: 1,
      transitionKey: "cash-reserved",
      reservationPublicId: "reservation.cash.trade-a.v1",
      amount: "1002",
      now: "2026-07-22T00:00:01.000Z",
    });
    assertThrows(
      () =>
        confirmSettlementAssetReservation(aggregate, {
          expectedAggregateVersion: 1,
          transitionKey: "stale",
          reservationPublicId: "reservation.asset.trade-a.v1",
          amount: "10",
          now: "2026-07-22T00:00:02.000Z",
        }),
      "settlement_stale_aggregate_version",
    );
    assertThrows(
      () =>
        confirmSettlementAssetReservation(aggregate, {
          expectedAggregateVersion: 2,
          transitionKey: "cash-reserved",
          reservationPublicId: "reservation.asset.trade-a.v1",
          amount: "10",
          now: "2026-07-22T00:00:02.000Z",
        }),
      "settlement_duplicate_transition",
    );
    const failed = failFinancialInstrumentSettlement(aggregate, {
      expectedAggregateVersion: 2,
      transitionKey: "fail",
      now: "2026-07-22T00:00:03.000Z",
      reason: "manual_failure",
    }).aggregate;
    assertThrows(
      () =>
        failFinancialInstrumentSettlement(failed, {
          expectedAggregateVersion: 3,
          transitionKey: "fail-again",
          now: "2026-07-22T00:00:04.000Z",
          reason: "again",
        }),
      "settlement_terminal_state",
    );
  },
);

Deno.test(
  "instruction validation enforces DVP arithmetic and domain separation",
  () => {
    assertThrows(
      () =>
        admitFinancialInstrumentSettlement({
          ...instruction(),
          grossValue: "999",
        }),
      "settlement_gross_value_mismatch",
    );
    assertThrows(
      () =>
        admitFinancialInstrumentSettlement({
          ...instruction(),
          sellerPlayerPublicId: "player.buyer.v1",
        }),
      "settlement_self_trade_prohibited",
    );
    assertThrows(
      () =>
        admitFinancialInstrumentSettlement({
          ...instruction(),
          marketplacePhysicalItemSettlementSupported: true as false,
        }),
      "settlement_domain_invalid",
    );
    assertThrows(
      () =>
        admitFinancialInstrumentSettlement({
          ...instruction(),
          partialSettlementSupported: true as false,
        }),
      "settlement_partial_settlement_must_remain_disabled",
    );
  },
);

Deno.test(
  "reservation confirmations require exact cash and asset amounts",
  () => {
    const aggregate = admitFinancialInstrumentSettlement(instruction());
    assertThrows(
      () =>
        confirmSettlementCashReservation(aggregate, {
          expectedAggregateVersion: 1,
          transitionKey: "cash-wrong",
          reservationPublicId: "reservation.cash.trade-a.v1",
          amount: "1001.99",
          now: "2026-07-22T00:00:01.000Z",
        }),
      "settlement_cash_reservation_amount_mismatch",
    );
    assertThrows(
      () =>
        confirmSettlementAssetReservation(aggregate, {
          expectedAggregateVersion: 1,
          transitionKey: "asset-wrong",
          reservationPublicId: "reservation.asset.trade-a.v1",
          amount: "9",
          now: "2026-07-22T00:00:01.000Z",
        }),
      "settlement_asset_reservation_quantity_mismatch",
    );
  },
);

function instruction(): FinancialInstrumentSettlementInstruction {
  return {
    settlementPublicId: "settlement.trade-a.v1",
    tradePublicId: "trade.trade-a.v1",
    buyOrderPublicId: "order.buy-a.v1",
    sellOrderPublicId: "order.sell-a.v1",
    buyerPlayerPublicId: "player.buyer.v1",
    sellerPlayerPublicId: "player.seller.v1",
    listingPublicId: "listing.northreach.exchange.0001.v1",
    instrumentPublicId: "instrument.northreach.common_equity.0001.v1",
    quotationCurrencyCode: "NRC",
    quantity: "10",
    executionPrice: "100",
    grossValue: "1000",
    buyerFeeAmount: "2",
    sellerFeeAmount: "1",
    tradeExecutedAt: "2026-07-22T00:00:00.000Z",
    settlementDueAt: "2026-07-22T00:05:00.000Z",
    settlementConvention: "T0",
    idempotencyKey: "settle-trade-a",
    inputDigestSha256: "a".repeat(64),
    settlementDomain: "financial_instrument",
    marketplacePhysicalItemSettlementSupported: false,
    partialSettlementSupported: false,
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
