import { compareMarketDecimals } from "../calculations/decimalMath.ts";
import type {
  OrderFillCommand,
  OrderReservationAdmissionContext,
  OrderReservationAggregate,
  OrderReservationOrderState,
  OrderReservationSubmission,
  OrderReservationTradingRules,
} from "./orderReservationStateMachine.ts";
export function validateAdmission(
  submission: OrderReservationSubmission,
  context: OrderReservationAdmissionContext,
): void {
  validateRules(context.tradingRules);
  for (
    const [label, value] of [
      ["gamePublicId", submission.gamePublicId],
      ["playerPublicId", submission.playerPublicId],
      ["listingPublicId", submission.listingPublicId],
      ["instrumentPublicId", submission.instrumentPublicId],
      ["idempotencyKey", submission.idempotencyKey],
    ] as const
  ) {
    if (!value.trim() || value.length > 160) {
      throw new Error(`${label}_invalid`);
    }
  }
  if (!/^[A-Z]{3,16}$/.test(submission.quotationCurrencyCode)) {
    throw new Error("quotation_currency_invalid");
  }
  if (!/^[0-9a-f]{64}$/.test(submission.requestDigestSha256)) {
    throw new Error("request_digest_invalid");
  }
  if (
    !Number.isInteger(submission.reviewedQuoteVersion) ||
    submission.reviewedQuoteVersion < 1
  ) {
    throw new Error("quote_version_invalid");
  }
  if (context.gameStatus !== "active") throw new Error("game_ended");
  if (context.marketPaused) throw new Error("market_paused");
  if (!context.exchangeOpen) throw new Error("exchange_closed");
  if (!context.instrumentActive || !context.listingActive) {
    throw new Error("inactive_instrument_or_listing");
  }
  assertIsoTime(context.now, "admission_time_invalid");
  assertIsoTime(submission.reviewedAt, "reviewed_at_invalid");
  assertIsoTime(submission.staleAfter, "stale_after_invalid");
  if (
    Date.parse(context.now) > Date.parse(submission.staleAfter) ||
    Date.parse(submission.reviewedAt) > Date.parse(context.now)
  ) {
    throw new Error("stale_reviewed_quote");
  }
  if (submission.expiresAt !== null) {
    assertIsoTime(submission.expiresAt, "order_expiry_invalid");
    if (Date.parse(submission.expiresAt) <= Date.parse(context.now)) {
      throw new Error("order_expiry_invalid");
    }
  }

  assertBoundedDecimal(submission.quantity, false);
  assertBoundedDecimal(submission.reviewedPrice, false);
  assertBoundedDecimal(context.availableCash, true);
  assertBoundedDecimal(context.availableAssetQuantity, true);
  if (
    compareMarketDecimals(
      submission.quantity,
      context.tradingRules.minimumOrderQuantity,
    ) < 0
  ) {
    throw new Error("quantity_below_minimum");
  }
  assertIncrement(
    submission.quantity,
    context.tradingRules.quantityIncrement,
    "quantity_increment_invalid",
  );
  assertIncrement(
    submission.reviewedPrice,
    context.tradingRules.priceIncrement,
    "reviewed_price_increment_invalid",
  );
  if (submission.orderType === "limit") {
    const limit = requireLimitPrice(submission.limitPrice);
    assertBoundedDecimal(limit, false);
    assertIncrement(
      limit,
      context.tradingRules.priceIncrement,
      "limit_price_increment_invalid",
    );
  } else if (submission.limitPrice !== null) {
    throw new Error("market_order_limit_price_not_allowed");
  }
}

export function validateRules(rules: OrderReservationTradingRules): void {
  if (
    rules.shortSellingSupported !== false ||
    rules.partialFillSupported !== false
  ) {
    throw new Error("unsupported_trading_feature_enabled");
  }
  for (
    const value of [
      rules.minimumOrderQuantity,
      rules.quantityIncrement,
      rules.priceIncrement,
    ]
  ) {
    assertBoundedDecimal(value, false);
  }
  assertBoundedDecimal(rules.fixedFee, true);
  if (
    !Number.isFinite(rules.transactionFeeRate) ||
    rules.transactionFeeRate < 0 || rules.transactionFeeRate > 0.2 ||
    !Number.isFinite(rules.exchangeFeeRate) ||
    rules.exchangeFeeRate < 0 || rules.exchangeFeeRate > 0.2
  ) {
    throw new Error("fee_policy_invalid");
  }
}

export function validateTransitionEnvelope(
  aggregate: OrderReservationAggregate,
  command: Pick<
    OrderFillCommand,
    "expectedAggregateVersion" | "transitionKey" | "now"
  >,
): void {
  if (command.expectedAggregateVersion !== aggregate.aggregateVersion) {
    throw new Error("stale_aggregate_version");
  }
  if (!command.transitionKey.trim() || command.transitionKey.length > 160) {
    throw new Error("transition_key_invalid");
  }
  if (aggregate.processedTransitionKeys.includes(command.transitionKey)) {
    throw new Error("duplicate_transition");
  }
  assertIsoTime(command.now, "transition_time_invalid");
}

export function enforceLimit(
  order: OrderReservationOrderState,
  executionPrice: string,
): void {
  if (order.orderType !== "limit") return;
  const limit = requireLimitPrice(order.limitPrice);
  if (
    order.side === "buy" &&
    compareMarketDecimals(executionPrice, limit) > 0
  ) {
    throw new Error("buy_limit_not_satisfied");
  }
  if (
    order.side === "sell" &&
    compareMarketDecimals(executionPrice, limit) < 0
  ) {
    throw new Error("sell_limit_not_satisfied");
  }
}

export function assertIncrement(
  value: string,
  increment: string,
  errorCode: string,
): void {
  const valueUnits = toMicrounits(value, false);
  const incrementUnits = toMicrounits(increment, false);
  if (valueUnits % incrementUnits !== 0n) throw new Error(errorCode);
}

export function assertBoundedDecimal(value: string, allowZero: boolean): void {
  toMicrounits(value, allowZero);
}

function toMicrounits(value: string, allowZero: boolean): bigint {
  const text = String(value).trim();
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/.test(text)) {
    throw new Error("amount_precision_invalid");
  }
  const [whole, fraction = ""] = text.split(".");
  const units = BigInt(whole) * 1_000_000n +
    BigInt(fraction.padEnd(6, "0"));
  if (units < 0n || (!allowZero && units === 0n)) {
    throw new Error("amount_value_invalid");
  }
  return units;
}

export function requireLimitPrice(value: string | null): string {
  if (value === null) throw new Error("limit_price_required");
  assertBoundedDecimal(value, false);
  return value;
}

export function assertIsoTime(value: string, errorCode: string): void {
  if (!value || Number.isNaN(Date.parse(value))) throw new Error(errorCode);
}
