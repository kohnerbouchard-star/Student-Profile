import type { PriceTimeBookOrder } from "./priceTimeOrderBookStateMachine.ts";
import type { OrderReservationSubmission } from "./orderReservationStateMachine.ts";

export const time = "2026-01-01T09:00:00.000Z";
export const later = "2026-01-01T09:01:00.000Z";
export const policy = {
  quantityIncrement: "0.1",
  priceIncrement: "0.01",
  partialFillSupported: true as const,
  shortSellingSupported: false as const,
  settlementDomain: "financial_instrument" as const,
  marketplacePhysicalItemSettlementSupported: false as const,
};
export function order(
  id: string,
  player: string,
  side: "buy" | "sell",
  quantity = "2",
  price = "10",
): PriceTimeBookOrder {
  return {
    orderPublicId: id,
    reservationPublicId: `reserve.${id}.v1`,
    playerPublicId: player,
    side,
    originalQuantity: quantity,
    remainingQuantity: quantity,
    filledQuantity: "0",
    limitPrice: price,
    submittedAt: time,
    prioritySequence: 1,
    version: 1,
    status: "open",
    terminalAt: null,
    replacedByOrderPublicId: null,
  };
}
export function book(orders: PriceTimeBookOrder[] = []) {
  return {
    bookPublicId: "book.test.v1",
    listingPublicId: "listing.test.v1",
    instrumentPublicId: "asset.test.v1",
    quotationCurrencyCode: "NRC",
    observedAt: time,
    orders,
    policy,
  };
}
export function rules() {
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
export function submission(
  side: "buy" | "sell" = "buy",
): OrderReservationSubmission {
  return {
    gamePublicId: "game.test.v1",
    playerPublicId: "player.test.v1",
    listingPublicId: "listing.test.v1",
    instrumentPublicId: "asset.test.v1",
    quotationCurrencyCode: "NRC",
    side,
    orderType: "limit",
    quantity: "10",
    limitPrice: "10",
    reviewedPrice: "10",
    reviewedQuoteVersion: 7,
    reviewedAt: time,
    staleAfter: "2026-01-01T09:02:00.000Z",
    expiresAt: "2026-01-01T10:00:00.000Z",
    idempotencyKey: "once",
    requestDigestSha256: "a".repeat(64),
  };
}
export function context() {
  return {
    now: time,
    gameStatus: "active" as const,
    marketPaused: false,
    exchangeOpen: true,
    instrumentActive: true,
    listingActive: true,
    availableCash: "1000",
    availableAssetQuantity: "100",
    tradingRules: rules(),
  };
}
export function fill() {
  return {
    expectedAggregateVersion: 1,
    transitionKey: "fill",
    now: later,
    quoteVersion: 7,
    executionPrice: "9.5",
    fillQuantity: "10",
    quoteObservedAt: time,
    quoteStaleAfter: "2026-01-01T09:02:00.000Z",
    gameStatus: "active" as const,
    marketPaused: false,
    exchangeOpen: true,
  };
}
export function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)}; expected ${JSON.stringify(expected)}`,
    );
  }
}
export function throws(fn: () => unknown, message: string) {
  try {
    fn();
  } catch (error) {
    if (error instanceof Error && error.message === message) return;
    throw error;
  }
  throw new Error(`Expected ${message}`);
}
